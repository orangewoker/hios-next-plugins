import psd from './vendor/ag-psd.js';
const { writePsd } = psd;

// Images never leave the user's device during PSD assembly.
export async function composeLayers(bytes, capture, readSource) {
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  const width = capture?.bounds?.[2], height = capture?.bounds?.[3];
  if (manifest.schema !== 'hios.layers/v1' || !Array.isArray(manifest.layers) || manifest.layers.length < 2 || manifest.layers.length > 30) throw new Error('无效的分层素材清单');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width*height*manifest.layers.length > 64*1024*1024) throw new Error('分层总像素超过本地组装限制，请缩小范围或减少层数');
  async function pixels(url) {
    if (typeof url !== 'string' || !url.startsWith('hios-asset://')) throw new Error('图层仅允许读取 HIOS 本地素材');
    const file = await readSource({url});
    const bitmap = await createImageBitmap(new Blob([file.bytes]));
    try {
      if (bitmap.width*bitmap.height > 16*1024*1024) throw new Error('模型结果图片过大');
      if (Math.abs(bitmap.width/bitmap.height-width/height)/(width/height) > .05) throw new Error('模型输出宽高比与原范围不符，已保留素材；请更换支持该宽高比的图片模型');
      const canvas = document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);
      return ctx.getImageData(0,0,width,height);
    } finally { bitmap.close(); }
  }
  const children=[];
  for(const layer of manifest.layers) {
    let imageData = layer.empty ? new ImageData(width,height) : await pixels(layer.image);
    if(layer.mask) {
      const mask=await pixels(layer.mask); let min=255,max=0,colored=0;
      for(let i=0;i<mask.data.length;i+=4) {
        const [r,g,b]=mask.data.subarray(i,i+3),a=Math.round(.2126*r+.7152*g+.0722*b);
        min=Math.min(min,a);max=Math.max(max,a);if(Math.max(r,g,b)-Math.min(r,g,b)>30)colored++;
        imageData.data[i+3]=Math.round(imageData.data[i+3]*a/255*mask.data[i+3]/255);
      }
      if(min>40 || max<215 || colored>width*height*.05) throw new Error(`“${layer.name}”未返回有效黑白蒙版，未导入错误图层；素材已保留`);
    }
    children.push({name:String(layer.name || '图层').slice(0,80),imageData});
  }
  const composite=document.createElement('canvas');composite.width=width;composite.height=height;
  const ctx=composite.getContext('2d');
  const scratch=document.createElement('canvas');scratch.width=width;scratch.height=height;
  const scratchCtx=scratch.getContext('2d');
  for(const child of children){scratchCtx.putImageData(child.imageData,0,0);ctx.drawImage(scratch,0,0);}
  const output=new Uint8Array(writePsd({width,height,children,imageData:ctx.getImageData(0,0,width,height)},{generateThumbnail:false}));
  if(output.length>64*1024*1024)throw new Error('组装 PSD 超过64MB，请减少层数或缩小范围');
  return output;
}
