# encoding: utf-8
# HIOS SketchUp Bridge Loader (v1.1.0)
require 'sketchup.rb'
require 'extensions.rb'

module HiosSketchupBridge
  EXTENSION_ID = 'hios_sketchup_bridge'
  BRIDGE_VERSION = '1.1.0'

  unless file_loaded?(__FILE__)
    ext = SketchupExtension.new(
      'HIOS SketchUp Bridge',
      File.join(File.dirname(__FILE__), 'hios_sketchup_bridge', 'main')
    )
    ext.description = 'Loopback-only local bridge allowing HIOS Next / DeepSeek Harness (DSH) to inspect, create, modify, style, and capture SketchUp models.'
    ext.version = BRIDGE_VERSION
    ext.copyright = 'HIOS Next'
    ext.creator = 'HIOS Next'
    Sketchup.register_extension(ext, true)
    file_loaded(__FILE__)
  end
end
