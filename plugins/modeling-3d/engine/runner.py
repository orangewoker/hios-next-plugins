"""Controlled finalization; the supplied build script is trusted process-capability code."""
import bpy
import sys
sys.dont_write_bytecode = True
import os
import json
import math
from mathutils import Vector

task_dir = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(task_dir, 'request.json'), encoding='utf-8') as handle:
    request = json.load(handle)
sys.path.insert(0, request['library'])

if request.get('export'):
    target = os.path.join(task_dir, 'model.' + request['export'])
    if request['export'] == 'fbx':
        bpy.ops.export_scene.fbx(filepath=target, use_selection=False, object_types={'MESH'}, path_mode='COPY', embed_textures=True)
    elif request['export'] == 'usdz':
        props = bpy.ops.wm.usd_export.get_rna_type().properties
        options = {'export_textures_mode': 'NEW'} if 'export_textures_mode' in props else {'export_textures': True}
        if 'selected_objects_only' in props:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in bpy.context.scene.objects:
                if obj.type == 'MESH' and not obj.hide_render:
                    obj.select_set(True)
            options['selected_objects_only'] = True
        bpy.ops.wm.usd_export(filepath=target, **options)
    else:
        raise RuntimeError('Unsupported export')
    print('MODELING_EXPORTED ' + target, flush=True)
else:
    with open(os.path.join(task_dir, 'build.py'), encoding='utf-8') as handle:
        exec(compile(handle.read(), 'build.py', 'exec'), {'__name__': '__main__'})
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]
    if not meshes or not any(len(o.data.polygons) for o in meshes):
        raise RuntimeError('No deliverable mesh geometry')
    points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
    if not all(math.isfinite(v) for p in points for v in p):
        raise RuntimeError('Non-finite geometry')
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    size = hi - lo
    if max(size) < 0.00001 or max(size) > 10000:
        raise RuntimeError('Invalid model scale')
    stats = {'objects': len(meshes), 'vertices': sum(len(o.data.vertices) for o in meshes), 'dimensionsMeters': list(size)}
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    # Preview rig is separate from the model exported to GLB.
    center = (lo + hi) / 2
    span = max(size.length, 0.1)
    for obj in list(scene.objects):
        if obj.name.startswith('HIOS_Preview_'):
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new('HIOS_Preview_Camera')
    cam = bpy.data.objects.new('HIOS_Preview_Camera', cam_data)
    scene.collection.objects.link(cam)
    cam.location = center + Vector((span * 0.85, -span * 1.15, span * 0.8))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = max(1000, span * 10)
    cam.data.lens = 48
    scene.camera = cam
    for name, offset, power in [('Key', (1, -1, 2), 1000), ('Fill', (-1, -0.5, 1), 600)]:
        data = bpy.data.lights.new('HIOS_Preview_' + name, 'AREA')
        data.energy = power * max(span * span, 0.01)
        data.shape = 'DISK'
        data.size = span
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = center + Vector(offset) * span
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    if not scene.world:
        scene.world = bpy.data.worlds.new('World')
    scene.world.color = (0.15, 0.15, 0.15)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.render.filepath = os.path.join(task_dir, 'preview.png')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(task_dir, 'model.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(task_dir, 'model.glb'), export_format='GLB', use_selection=True, export_apply=True)
    bpy.ops.render.render(write_still=True)
    with open(os.path.join(task_dir, 'stats.json'), 'w', encoding='utf-8') as handle:
        json.dump(stats, handle)
    print('MODELING_COMPLETE', flush=True)
