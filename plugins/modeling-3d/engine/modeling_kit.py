import bpy


def material(name, color=(0.6, 0.6, 0.6, 1), roughness=0.45, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def box(name, size, location=(0, 0, 0), material=None, bevel=0.005):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new('Edge bevel', 'BEVEL')
        mod.width = min(bevel, min(size) / 4)
        mod.segments = 3
    return obj


def cylinder(name, radius, depth, location=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj
