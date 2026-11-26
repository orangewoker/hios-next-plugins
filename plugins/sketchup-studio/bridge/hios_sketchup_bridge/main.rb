# encoding: utf-8
# HIOS SketchUp Bridge Main (v1.2.0)
require 'sketchup.rb'
require 'socket'
require 'json'
require 'securerandom'
require 'stringio'
require 'fileutils'
require 'base64'
require 'time'
require 'tmpdir'

module HiosSketchupBridge
  BRIDGE_VERSION = '1.2.0' unless defined?(BRIDGE_VERSION)

  class Server
    MAX_BODY_BYTES = 4 * 1024 * 1024

    def initialize
      @queue = Queue.new
      @token = SecureRandom.hex(32)
      @pid = Process.pid
      @version = Sketchup.version.to_s
      @year = detect_year(@version)
      @server = nil
      @port = nil
      @thread = nil
      @timer_id = nil
      @registry_path = nil
      @started_at = Time.now.utc.iso8601
      @change_seq = 0
      @observed_models = {}
    end

    def bump_change_seq
      @change_seq += 1
    end

    def attach_model_observer(model)
      return unless model
      key = model.object_id
      return if @observed_models[key]
      bridge = self
      obs_class = Class.new(Sketchup::ModelObserver) do
        define_method(:onTransactionCommit) { |_m| bridge.bump_change_seq }
        define_method(:onTransactionUndo) { |_m| bridge.bump_change_seq }
        define_method(:onTransactionRedo) { |_m| bridge.bump_change_seq }
        define_method(:onEraseAll) { |_m| bridge.bump_change_seq }
        define_method(:onActivePathChanged) { |_m| bridge.bump_change_seq }
      end
      model.add_observer(obs_class.new)
      @observed_models[key] = true
    rescue StandardError
      nil
    end

    def start
      return if @server

      @server = TCPServer.new('127.0.0.1', 0)
      @port = @server.addr[1]
      write_registry
      register_cleanup

      @timer_id = UI.start_timer(0.05, true) { drain_queue }
      @thread = Thread.new { accept_loop }
      @thread.abort_on_exception = false
      puts "[HIOS SketchUp Bridge] v#{BRIDGE_VERSION} listening on 127.0.0.1:#{@port} (SketchUp #{@year} / #{@version}, PID #{@pid})"
    rescue StandardError => e
      warn "[HIOS SketchUp Bridge] Failed to start: #{e.class}: #{e.message}"
    end

    def stop
      if @timer_id
        UI.stop_timer(@timer_id) rescue nil
        @timer_id = nil
      end
      if @server
        @server.close rescue nil
        @server = nil
      end
      if @thread
        @thread.kill rescue nil
        @thread = nil
      end
      remove_registry
    end

    private

    def detect_year(ver)
      major = ver.to_s.split('.').first.to_i
      return (2000 + major).to_s if major >= 13 && major < 100
      return major.to_s if major >= 2000
      'unknown'
    end

    def state_dir
      base = ENV['LOCALAPPDATA'] || ENV['APPDATA'] || Dir.tmpdir
      dir = File.join(base, 'hios-sketchup-bridge', 'instances')
      FileUtils.mkdir_p(dir)
      dir
    end

    def write_registry
      @registry_path = File.join(state_dir, "su-#{@year}-#{@pid}.json")
      model = Sketchup.active_model rescue nil
      payload = {
        bridgeVersion: BRIDGE_VERSION,
        year: @year,
        version: @version,
        pid: @pid,
        port: @port,
        token: @token,
        startedAt: @started_at,
        modelTitle: model ? safe_utf8(model.title) : '',
        modelPath: model ? safe_utf8(model.path) : ''
      }
      tmp = "#{@registry_path}.tmp"
      File.write(tmp, JSON.pretty_generate(payload), mode: 'w:UTF-8')
      FileUtils.mv(tmp, @registry_path, force: true)
    end

    def remove_registry
      return unless @registry_path && File.exist?(@registry_path)
      File.delete(@registry_path) rescue nil
    end

    def register_cleanup
      at_exit { remove_registry }
      bridge = self
      attach_model_observer(Sketchup.active_model) rescue nil
      observer_class = Class.new(Sketchup::AppObserver) do
        define_method(:onQuit) { bridge.stop }
        define_method(:onNewModel) { |m| bridge.attach_model_observer(m); bridge.bump_change_seq }
        define_method(:onOpenModel) { |m| bridge.attach_model_observer(m); bridge.bump_change_seq }
      end
      Sketchup.add_observer(observer_class.new)
    rescue StandardError
      nil
    end

    def accept_loop
      loop do
        break unless @server
        client = @server.accept
        Thread.new(client) { |sock| handle_client(sock) }
      end
    rescue IOError, Errno::EBADF, Errno::EINVAL
      nil
    rescue StandardError => e
      warn "[HIOS SketchUp Bridge] Accept error: #{e.message}"
      sleep 0.2
      retry if @server
    end

    def secure_compare(a, b)
      return false unless a.is_a?(String) && b.is_a?(String) && a.bytesize == b.bytesize
      diff = 0
      a.bytes.zip(b.bytes) { |x, y| diff |= (x ^ y) }
      diff == 0
    end

    def handle_client(sock)
      request_line = sock.gets("\n")
      return unless request_line

      parts = request_line.strip.split(' ')
      method = parts[0].to_s.upcase
      path = parts[1].to_s.split('?').first

      headers = {}
      while (line = sock.gets("\n"))
        line = line.strip
        break if line.empty?
        idx = line.index(':')
        next unless idx
        key = line[0...idx].strip.downcase
        val = line[(idx + 1)..-1].strip
        headers[key] = val
      end

      if headers.key?('origin')
        send_json(sock, 403, { ok: false, error: 'Cross-origin requests are rejected' })
        return
      end

      expected = "Bearer #{@token}"
      unless secure_compare(headers['authorization'].to_s, expected)
        send_json(sock, 401, { ok: false, error: 'Unauthorized' })
        return
      end

      content_length = headers['content-length'].to_i
      if content_length < 0 || content_length > MAX_BODY_BYTES
        send_json(sock, 413, { ok: false, error: 'Request body too large' })
        return
      end

      raw_body = ''
      if content_length > 0
        raw_body = read_exact(sock, content_length)
        raw_body.force_encoding('UTF-8')
      end

      body = raw_body.empty? ? {} : JSON.parse(raw_body)
      reply_queue = Queue.new
      @queue.push({ method: method, path: path, body: body, reply: reply_queue })
      status, payload = reply_queue.pop
      send_json(sock, status, payload)
    rescue JSON::ParserError => e
      send_json(sock, 400, { ok: false, error: "Invalid JSON: #{e.message}" })
    rescue StandardError => e
      send_json(sock, 500, { ok: false, error: "#{e.class}: #{e.message}" })
    ensure
      sock.close rescue nil
    end

    def read_exact(sock, length)
      buf = String.new(encoding: 'BINARY')
      while buf.bytesize < length
        chunk = sock.read(length - buf.bytesize)
        break unless chunk && !chunk.empty?
        buf << chunk
      end
      buf
    end

    def send_json(sock, status, payload)
      json = JSON.generate(payload).encode('UTF-8', invalid: :replace, undef: :replace)
      reason = { 200 => 'OK', 400 => 'Bad Request', 401 => 'Unauthorized', 403 => 'Forbidden', 404 => 'Not Found', 413 => 'Payload Too Large', 500 => 'Internal Server Error' }[status] || 'OK'
      resp = "HTTP/1.1 #{status} #{reason}\r\n" \
             "Content-Type: application/json; charset=utf-8\r\n" \
             "Content-Length: #{json.bytesize}\r\n" \
             "Connection: close\r\n\r\n" \
             "#{json}"
      sock.write(resp)
    rescue StandardError
      nil
    end

    def drain_queue
      until @queue.empty?
        job = @queue.pop(true) rescue break
        result = dispatch_main_thread(job[:method], job[:path], job[:body])
        job[:reply].push(result)
      end
    end

    def dispatch_main_thread(method, path, body)
      case [method, path]
      when ['GET', '/ping']
        [200, handle_ping]
      when ['POST', '/inspect']
        [200, handle_inspect(body)]
      when ['POST', '/run_ruby']
        [200, handle_run_ruby(body)]
      when ['POST', '/capture_view']
        [200, handle_capture_view(body)]
      when ['POST', '/camera_control']
        [200, handle_camera_control(body)]
      when ['POST', '/model_file']
        [200, handle_model_file(body)]
      when ['POST', '/select_entity']
        [200, handle_select_entity(body)]
      when ['POST', '/undo']
        [200, handle_undo]
      when ['POST', '/redo']
        [200, handle_redo]
      else
        [404, { ok: false, error: "Unknown route: #{method} #{path}" }]
      end
    rescue Exception => e
      [200, { ok: false, error: "#{e.class}: #{safe_utf8(e.message)}", backtrace: (e.backtrace || []).first(8).map { |l| safe_utf8(l) } }]
    end

    def safe_utf8(val)
      val.to_s.dup.force_encoding('UTF-8').encode('UTF-8', invalid: :replace, undef: :replace)
    end

    def unit_name(model)
      u = model.options['UnitsOptions']['LengthUnit'] rescue nil
      { 0 => 'inches', 1 => 'feet', 2 => 'mm', 3 => 'cm', 4 => 'm' }[u] || 'unknown'
    end

    def pt_mm(pt)
      [pt.x.to_mm.round(2), pt.y.to_mm.round(2), pt.z.to_mm.round(2)]
    end

    def bounds_mm(bb)
      return nil if bb.nil? || bb.empty?
      {
        min: pt_mm(bb.min),
        max: pt_mm(bb.max),
        size: [bb.width.to_mm.round(2), bb.height.to_mm.round(2), bb.depth.to_mm.round(2)]
      }
    end

    def current_display_mode(model)
      rm = model.rendering_options['RenderMode'] rescue 3
      case rm
      when 0 then 'wire'
      when 5 then 'white'
      else 'material'
      end
    end

    def model_revision(model)
      return "none:#{@change_seq}" unless model
      attach_model_observer(model)
      cam = model.active_view.camera rescue nil
      cam_sig = if cam
        e = cam.eye
        t = cam.target
        u = cam.up
        fov = cam.perspective? ? cam.fov.round(2) : cam.height.round(2)
        "#{e.x.round(2)},#{e.y.round(2)},#{e.z.round(2)}|#{t.x.round(2)},#{t.y.round(2)},#{t.z.round(2)}|#{u.x.round(2)},#{u.y.round(2)},#{u.z.round(2)}|#{fov}"
      else
        'nocam'
      end
      bb = model.bounds
      bb_sig = bb.empty? ? 'empty' : "#{bb.width.round(1)},#{bb.height.round(1)},#{bb.depth.round(1)},#{bb.center.x.round(1)},#{bb.center.y.round(1)},#{bb.center.z.round(1)}"
      "#{@change_seq}:#{model.object_id}:#{model.entities.length}:#{model.active_entities.length}:#{model.modified?}:#{current_display_mode(model)}:#{model.shadow_info['DisplayShadows'] == true}:#{model.pages.length}:#{bb_sig}:#{cam_sig}"
    end

    def handle_ping
      model = Sketchup.active_model
      {
        ok: true,
        bridgeVersion: BRIDGE_VERSION,
        year: @year,
        version: @version,
        pid: @pid,
        port: @port,
        revision: model_revision(model),
        modelTitle: model ? safe_utf8(model.title) : '',
        modelPath: model ? safe_utf8(model.path) : '',
        modified: model ? model.modified? : false,
        units: model ? unit_name(model) : 'unknown',
        entityCount: model ? model.entities.length : 0,
        activeEntityCount: model ? model.active_entities.length : 0,
        selectionCount: model ? model.selection.length : 0,
        displayMode: model ? current_display_mode(model) : 'material',
        shadows: model ? (model.shadow_info['DisplayShadows'] == true) : false,
        scenes: model ? model.pages.map { |p| safe_utf8(p.name) } : []
      }
    end

    def summarize_entity(ent, depth, max_depth)
      base = {
        id: ent.entityID,
        type: ent.typename,
        tag: ent.layer ? safe_utf8(ent.layer.name) : '',
        visible: ent.visible?
      }
      if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
        base[:name] = safe_utf8(ent.name)
        base[:definitionName] = safe_utf8(ent.definition.name) if ent.respond_to?(:definition) && ent.definition
        base[:boundsMm] = bounds_mm(ent.bounds)
        base[:originMm] = pt_mm(ent.transformation.origin)
        children = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
        base[:childCount] = children.length
        if depth < max_depth
          base[:children] = summarize_collection(children, depth + 1, max_depth)
        end
      elsif ent.respond_to?(:bounds)
        base[:boundsMm] = bounds_mm(ent.bounds)
      end
      base
    end

    def summarize_collection(entities, depth, max_depth, max_items = 80)
      containers = []
      loose_faces = 0
      loose_edges = 0
      other_count = 0
      entities.each do |ent|
        if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
          containers << summarize_entity(ent, depth, max_depth) if containers.length < max_items
        elsif ent.is_a?(Sketchup::Face)
          loose_faces += 1
        elsif ent.is_a?(Sketchup::Edge)
          loose_edges += 1
        else
          other_count += 1
        end
      end
      {
        groupsAndComponents: containers,
        looseFaces: loose_faces,
        looseEdges: loose_edges,
        otherEntities: other_count,
        truncated: entities.count { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) } > max_items
      }
    end

    def handle_inspect(body)
      model = Sketchup.active_model
      return { ok: false, error: 'No active SketchUp model' } unless model

      max_depth = [[(body['maxDepth'] || 2).to_i, 0].max, 4].min
      selection_only = body['selectionOnly'] == true
      cam = model.active_view.camera

      source_entities = selection_only ? model.selection.to_a : model.active_entities.to_a
      {
        ok: true,
        year: @year,
        version: @version,
        pid: @pid,
        modelTitle: safe_utf8(model.title),
        modelPath: safe_utf8(model.path),
        modified: model.modified?,
        units: unit_name(model),
        boundsMm: bounds_mm(model.bounds),
        entityCount: model.entities.length,
        selectionCount: model.selection.length,
        displayMode: current_display_mode(model),
        shadows: model.shadow_info['DisplayShadows'] == true,
        tags: model.layers.map { |l| { name: safe_utf8(l.name), visible: l.visible? } },
        scenes: model.pages.map { |p| safe_utf8(p.name) },
        materials: model.materials.map { |m| safe_utf8(m.name) }.first(60),
        camera: {
          eyeMm: pt_mm(cam.eye),
          targetMm: pt_mm(cam.target),
          up: [cam.up.x.round(4), cam.up.y.round(4), cam.up.z.round(4)],
          perspective: cam.perspective?,
          fov: cam.perspective? ? cam.fov.round(2) : nil
        },
        selectionOnly: selection_only,
        hierarchy: summarize_collection(source_entities, 0, max_depth)
      }
    end

    def eval_in_model_context(code, model)
      entities = model.active_entities
      selection = model.selection
      definitions = model.definitions
      materials = model.materials
      layers = model.layers
      view = model.active_view
      eval(code, binding, '(hios-dsh-ruby)', 1)
    end

    def handle_run_ruby(body)
      model = Sketchup.active_model
      return { ok: false, error: 'No active SketchUp model' } unless model

      code = body['code'].to_s
      return { ok: false, error: 'Missing Ruby code' } if code.strip.empty?

      undoable = body['undoable'] != false
      op_name = safe_utf8(body['operationName'] || 'HIOS SketchUp 建模操作')

      captured = StringIO.new
      old_stdout = $stdout
      $stdout = captured
      started = false
      result_val = nil

      begin
        if undoable
          model.start_operation(op_name, true)
          started = true
        end
        result_val = eval_in_model_context(code, model)
        if started
          model.commit_operation
          started = false
        end
        model.active_view.invalidate
        model.active_view.refresh if model.active_view.respond_to?(:refresh)
        {
          ok: true,
          operationName: op_name,
          undoable: undoable,
          result: safe_utf8(result_val.inspect).slice(0, 8000),
          stdout: safe_utf8(captured.string).slice(0, 16000),
          entityCount: model.entities.length,
          selectionCount: model.selection.length,
          boundsMm: bounds_mm(model.bounds)
        }
      rescue Exception => e
        model.abort_operation if started
        {
          ok: false,
          error: "#{e.class}: #{safe_utf8(e.message)}",
          stdout: safe_utf8(captured.string).slice(0, 16000),
          backtrace: (e.backtrace || []).first(8).map { |l| safe_utf8(l) }
        }
      ensure
        $stdout = old_stdout
      end
    end

    def apply_camera_preset(view, model, preset)
      bb = model.bounds
      center = bb.empty? ? Geom::Point3d.new(0, 0, 0) : bb.center
      radius = bb.empty? ? 100.0 : [bb.diagonal * 0.9, 40.0].max
      case preset
      when 'iso'
        eye = center.offset(Geom::Vector3d.new(1, -1, 0.8).normalize, radius * 1.45)
        up = Geom::Vector3d.new(0, 0, 1)
      when 'front'
        eye = center.offset(Geom::Vector3d.new(0, -1, 0), radius * 1.4)
        up = Geom::Vector3d.new(0, 0, 1)
      when 'back'
        eye = center.offset(Geom::Vector3d.new(0, 1, 0), radius * 1.4)
        up = Geom::Vector3d.new(0, 0, 1)
      when 'left'
        eye = center.offset(Geom::Vector3d.new(-1, 0, 0), radius * 1.4)
        up = Geom::Vector3d.new(0, 0, 1)
      when 'right'
        eye = center.offset(Geom::Vector3d.new(1, 0, 0), radius * 1.4)
        up = Geom::Vector3d.new(0, 0, 1)
      when 'top'
        eye = center.offset(Geom::Vector3d.new(0, 0, 1), radius * 1.5)
        up = Geom::Vector3d.new(0, 1, 0)
      else
        return false
      end
      cam = Sketchup::Camera.new(eye, center, up, true)
      view.camera = cam
      true
    end

    def snapshot_camera(cam)
      if cam.perspective?
        Sketchup::Camera.new(cam.eye.clone, cam.target.clone, cam.up.clone, true, cam.fov)
      else
        c = Sketchup::Camera.new(cam.eye.clone, cam.target.clone, cam.up.clone, false)
        c.height = cam.height
        c
      end
    end

    def handle_capture_view(body)
      model = Sketchup.active_model
      return { ok: false, error: 'No active SketchUp model' } unless model

      view = model.active_view
      width = [[(body['width'] || 1280).to_i, 320].max, 2560].min
      height = [[(body['height'] || 960).to_i, 240].max, 1920].min
      preset = (body['cameraPreset'] || 'current').to_s.downcase
      scene_name = body['sceneName'].to_s.strip
      display_mode = body['displayMode'].to_s.downcase
      shadows_param = body.key?('shadows') ? body['shadows'] : nil
      zoom_extents = body['zoomExtents'] == true
      restore_camera = body['restoreCamera'] != false
      restore_style = body['restoreStyle'] != false
      raw_fmt = (body['imageFormat'] || 'png').to_s.downcase
      image_format = (raw_fmt == 'jpg' || raw_fmt == 'jpeg') ? 'jpg' : 'png'
      transparent = (body['transparent'] == true) && (image_format == 'png')

      saved_cam = snapshot_camera(view.camera)
      ro = model.rendering_options
      saved_render_mode = ro['RenderMode']
      saved_edge_mode = ro['EdgeDisplayMode']
      saved_draw_ground = ro['DrawGround']
      saved_draw_underground = ro['DrawUnderground']
      saved_display_fog = ro['DisplayFog']
      saved_shadows = model.shadow_info['DisplayShadows']

      changed_camera = false
      changed_style = false
      begin
        unless scene_name.empty?
          page = model.pages.find { |p| safe_utf8(p.name) == scene_name }
          return { ok: false, error: "Scene not found: #{scene_name}" } unless page
          if page.camera
            view.camera = snapshot_camera(page.camera)
            changed_camera = true
          end
        end

        if preset != 'current'
          changed_camera = apply_camera_preset(view, model, preset) || changed_camera
        end
        if zoom_extents && !model.bounds.empty?
          view.zoom_extents
          changed_camera = true
        end

        case display_mode
        when 'material'
          ro['RenderMode'] = 3
          ro['EdgeDisplayMode'] = 1
          changed_style = true
        when 'white', 'monochrome'
          ro['RenderMode'] = 5
          ro['EdgeDisplayMode'] = 1
          changed_style = true
        when 'wire', 'wireframe'
          ro['RenderMode'] = 0
          ro['EdgeDisplayMode'] = 1
          changed_style = true
        end

        if transparent
          ro['DrawGround'] = false rescue nil
          ro['DrawUnderground'] = false rescue nil
          ro['DisplayFog'] = false rescue nil
          changed_style = true
        end

        unless shadows_param.nil?
          model.shadow_info['DisplayShadows'] = (shadows_param == true)
          changed_style = true
        end

        view.invalidate
        view.refresh if view.respond_to?(:refresh)

        cap_dir = File.join(File.dirname(state_dir), 'captures')
        FileUtils.mkdir_p(cap_dir)
        ext = image_format == 'jpg' ? 'jpg' : 'png'
        out_path = body['outputPath'].to_s.strip
        if out_path.empty?
          out_path = File.join(cap_dir, "su-#{@year}-#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}.#{ext}")
        else
          FileUtils.mkdir_p(File.dirname(out_path))
        end

        write_opts = {
          filename: out_path,
          width: width,
          height: height,
          antialias: true
        }
        if image_format == 'png'
          write_opts[:transparent] = transparent
        else
          write_opts[:compression] = 0.92
        end

        ok = view.write_image(write_opts)
        return { ok: false, error: 'view.write_image failed' } unless ok && File.exist?(out_path)

        bytes = File.binread(out_path)
        {
          ok: true,
          path: safe_utf8(out_path),
          width: width,
          height: height,
          cameraPreset: preset,
          sceneName: scene_name,
          displayMode: display_mode.empty? ? current_display_mode(model) : display_mode,
          shadows: model.shadow_info['DisplayShadows'] == true,
          imageFormat: image_format,
          mimeType: image_format == 'jpg' ? 'image/jpeg' : 'image/png',
          transparent: transparent,
          byteSize: bytes.bytesize,
          base64: Base64.strict_encode64(bytes)
        }
      ensure
        if changed_style && restore_style
          ro['RenderMode'] = saved_render_mode rescue nil
          ro['EdgeDisplayMode'] = saved_edge_mode rescue nil
          ro['DrawGround'] = saved_draw_ground rescue nil
          ro['DrawUnderground'] = saved_draw_underground rescue nil
          ro['DisplayFog'] = saved_display_fog rescue nil
          model.shadow_info['DisplayShadows'] = saved_shadows rescue nil
        end
        if changed_camera && restore_camera
          view.camera = saved_cam rescue nil
        end
        if (changed_style && restore_style) || (changed_camera && restore_camera)
          view.invalidate
        end
      end
    end

    def handle_camera_control(body)
      model = Sketchup.active_model
      return { ok: false, error: 'No active SketchUp model' } unless model

      view = model.active_view
      cam = view.camera
      action = body['action'].to_s.downcase

      case action
      when 'orbit'
        dx = body['dx'].to_f
        dy = body['dy'].to_f
        vec = cam.eye - cam.target
        dist = vec.length
        dist = 100.0 if dist < 1.0
        horiz = Math.hypot(vec.x, vec.y)
        azimuth = Math.atan2(vec.y, vec.x) - dx * 0.0085
        elev = Math.atan2(vec.z, horiz) + dy * 0.0085
        elev = [[elev, -1.48].max, 1.48].min
        cos_e = Math.cos(elev)
        new_eye = Geom::Point3d.new(
          cam.target.x + dist * cos_e * Math.cos(azimuth),
          cam.target.y + dist * cos_e * Math.sin(azimuth),
          cam.target.z + dist * Math.sin(elev)
        )
        new_cam = Sketchup::Camera.new(new_eye, cam.target.clone, Geom::Vector3d.new(0, 0, 1), cam.perspective?)
        new_cam.fov = cam.fov if cam.perspective?
        new_cam.height = cam.height unless cam.perspective?
        view.camera = new_cam
      when 'pan'
        dx = body['dx'].to_f
        dy = body['dy'].to_f
        dist = cam.eye.distance(cam.target)
        dist = 100.0 if dist < 1.0
        scale = cam.perspective? ? dist * 0.0017 : cam.height * 0.0022
        rx = cam.xaxis
        ry = cam.yaxis
        offset = Geom::Vector3d.new(
          (-rx.x * dx + ry.x * dy) * scale,
          (-rx.y * dx + ry.y * dy) * scale,
          (-rx.z * dx + ry.z * dy) * scale
        )
        new_cam = Sketchup::Camera.new(cam.eye.offset(offset), cam.target.offset(offset), cam.up.clone, cam.perspective?)
        new_cam.fov = cam.fov if cam.perspective?
        new_cam.height = cam.height unless cam.perspective?
        view.camera = new_cam
      when 'zoom'
        delta = body['delta'].to_f
        factor = Math.exp([[delta * 0.0014, -0.45].max, 0.45].min)
        if cam.perspective?
          vec = cam.eye - cam.target
          dist = vec.length
          dist = 100.0 if dist < 1.0
          new_dist = [[dist * factor, 2.0].max, 500000.0].min
          new_eye = cam.target.offset(vec.normalize, new_dist)
          new_cam = Sketchup::Camera.new(new_eye, cam.target.clone, cam.up.clone, true, cam.fov)
          view.camera = new_cam
        else
          new_cam = snapshot_camera(cam)
          new_cam.height = [[cam.height * factor, 2.0].max, 500000.0].min
          view.camera = new_cam
        end
      when 'preset'
        preset = body['preset'].to_s.downcase
        apply_camera_preset(view, model, preset)
        view.zoom_extents unless model.bounds.empty?
      else
        return { ok: false, error: "Unsupported camera action: #{action}" }
      end

      view.invalidate
      view.refresh if view.respond_to?(:refresh)

      preview_data_url = nil
      if body['fastPreview'] == true
        ro = model.rendering_options
        saved_rm = ro['RenderMode']
        saved_em = ro['EdgeDisplayMode']
        saved_sh = model.shadow_info['DisplayShadows']
        changed_style = false
        begin
          case body['displayMode'].to_s.downcase
          when 'material'
            ro['RenderMode'] = 3; ro['EdgeDisplayMode'] = 1; changed_style = true
          when 'white', 'monochrome'
            ro['RenderMode'] = 5; ro['EdgeDisplayMode'] = 1; changed_style = true
          when 'wire', 'wireframe'
            ro['RenderMode'] = 0; ro['EdgeDisplayMode'] = 1; changed_style = true
          end
          if body.key?('shadows')
            model.shadow_info['DisplayShadows'] = (body['shadows'] == true)
            changed_style = true
          end
          cap_dir = File.join(File.dirname(state_dir), 'captures')
          FileUtils.mkdir_p(cap_dir)
          tmp_jpg = File.join(cap_dir, "_live-#{@pid}.jpg")
          w = [[(body['width'] || 720).to_i, 320].max, 1280].min
          h = [[(body['height'] || 540).to_i, 240].max, 960].min
          ok = view.write_image({ filename: tmp_jpg, width: w, height: h, antialias: false, compression: 0.72 })
          if ok && File.exist?(tmp_jpg)
            preview_data_url = "data:image/jpeg;base64,#{Base64.strict_encode64(File.binread(tmp_jpg))}"
          end
        ensure
          if changed_style
            ro['RenderMode'] = saved_rm rescue nil
            ro['EdgeDisplayMode'] = saved_em rescue nil
            model.shadow_info['DisplayShadows'] = saved_sh rescue nil
            view.invalidate
          end
        end
      end

      {
        ok: true,
        action: action,
        revision: model_revision(model),
        previewDataUrl: preview_data_url
      }
    end

    def handle_select_entity(body)
      model = Sketchup.active_model
      return { ok: false, error: 'No active SketchUp model' } unless model

      ids = Array(body['entityIds']).map(&:to_i).reject { |i| i <= 0 }
      target_name = body['name'].to_s.strip
      matches = []

      walk = lambda do |ents|
        ents.each do |ent|
          if ids.include?(ent.entityID) || (!target_name.empty? && ent.respond_to?(:name) && safe_utf8(ent.name) == target_name)
            matches << ent
          end
          if ent.is_a?(Sketchup::Group)
            walk.call(ent.entities)
          elsif ent.is_a?(Sketchup::ComponentInstance) && ent.definition
            walk.call(ent.definition.entities)
          end
        end
      end
      walk.call(model.active_entities)

      model.selection.clear
      matches.each { |ent| model.selection.add(ent) rescue nil }
      model.active_view.invalidate
      { ok: true, selectedCount: model.selection.length, matchedIds: matches.map(&:entityID) }
    end

    def handle_model_file(body)
      model = Sketchup.active_model
      action = body['action'].to_s.downcase
      path = body['path'].to_s.strip

      case action
      when 'open'
        return { ok: false, error: 'Missing file path to open' } if path.empty?
        return { ok: false, error: "File does not exist: #{path}" } unless File.exist?(path)
        ok = Sketchup.open_file(path)
        { ok: ok, action: 'open', path: safe_utf8(path) }
      when 'save'
        return { ok: false, error: 'No active model' } unless model
        target = path.empty? ? model.path : path
        return { ok: false, error: 'Model has never been saved; please provide a target .skp path' } if target.to_s.empty?
        FileUtils.mkdir_p(File.dirname(target))
        ok = model.save(target)
        { ok: ok, action: 'save', path: safe_utf8(target) }
      when 'export'
        return { ok: false, error: 'No active model' } unless model
        return { ok: false, error: 'Missing export path' } if path.empty?
        FileUtils.mkdir_p(File.dirname(path))
        ok = model.export(path, false)
        { ok: ok && File.exist?(path), action: 'export', path: safe_utf8(path), exists: File.exist?(path) }
      else
        { ok: false, error: "Unsupported model_file action: #{action}. Expected open, save, or export." }
      end
    end

    def handle_undo
      ok = Sketchup.undo
      model = Sketchup.active_model
      model.active_view.invalidate if model
      { ok: ok, action: 'undo', entityCount: model ? model.entities.length : 0 }
    end

    def handle_redo
      ok = Sketchup.send_action('editRedo:')
      model = Sketchup.active_model
      model.active_view.invalidate if model
      { ok: ok, action: 'redo', entityCount: model ? model.entities.length : 0 }
    end
  end

  unless defined?(@server_instance) && @server_instance
    @server_instance = Server.new
    @server_instance.start
  end
end
