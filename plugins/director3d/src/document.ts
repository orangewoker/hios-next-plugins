import { z } from 'zod';
import { createEmptyScene, createMannequinObject, sceneSchema, getSceneLighting } from './scene';
import { anchorSchema } from './motion';
import { directorPlanSchema } from './sceneAnimation';
export const documentSchema = z.object({
  version: z.literal(1), scene: sceneSchema,
  plans: z.array(directorPlanSchema.safeExtend({ id: z.string().min(1), instruction: z.string().optional() })).max(100),
  selectedPlanId: z.string().default(''), anchors: z.array(anchorSchema).max(120).default([]),
  prompt: z.string().max(12000).default(''), model: z.string().default(''),
  lighting: z.object({ globalEnabled: z.boolean(), globalIntensity: z.number().min(0).max(100), sunEnabled: z.boolean(), azimuth: z.number().finite(), elevation: z.number().finite(), intensity: z.number().min(0).max(100), color: z.string().regex(/^#[\da-f]{6}$/i) }).optional(),
  sceneSettings: z.object({ gridVisible: z.boolean(), skyVisible: z.boolean() }).default({ gridVisible: true, skyVisible: true }),
}).superRefine((doc, ctx) => {
  for (const plan of doc.plans) for (const track of plan.tracks) {
    const object = doc.scene.objectList.find(o => o.threeJsonId === track.objectId);
    if (!object || (track.joint && object.objType !== 'mannequin')) ctx.addIssue({ code: 'custom', message: '动画轨道引用了不存在的物体或人偶' });
  }
});
export type DirectorDocument = z.infer<typeof documentSchema>;
export function initialDocument(): DirectorDocument {
  const scene = createEmptyScene();
  scene.sceneConfig.camera.position = { x: 4, y: 2.8, z: 6 };
  scene.sceneConfig.controls.target = { x: 0, y: 1, z: 0 };
  scene.objectList.push(createMannequinObject('person1'));
  return documentSchema.parse({ version: 1, scene, plans: [], lighting: getSceneLighting(scene) });
}
