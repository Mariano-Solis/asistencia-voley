const MAX_LIBRARY_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 280 * 1024;

const MIME_BY_EXTENSION = {
  pdf:"application/pdf",
  txt:"text/plain",
  doc:"application/msword",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint",
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function safeBase(name="material"){
  return name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,70)||"material";
}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("No Se Pudo Leer La Imagen."));};
    image.src=url;
  });
}

function canvasBlob(canvas,quality,type="image/webp"){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("No Se Pudo Optimizar La Imagen.")),type,quality);
  });
}

async function renderImage(file,maxSide,quality,type="image/webp"){
  const image=await loadImage(file);
  const width=image.naturalWidth||image.width;
  const height=image.naturalHeight||image.height;
  const scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("No Se Pudo Optimizar La Imagen.");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvasBlob(canvas,quality,type);
}

export async function prepareTrainingLibraryFile(file){
  if(!file)throw new Error("Seleccioná Un Archivo.");

  if(String(file.type||"").startsWith("image/")){
    if(file.size>MAX_SOURCE_IMAGE_BYTES)throw new Error("La Imagen Es Demasiado Grande. Elegí Una De Menos De 20 MB.");
    const webpPasses=[[1600,.82],[1500,.78],[1400,.74],[1300,.70],[1200,.66],[1100,.62],[1000,.58]];
    const jpegPasses=[[1500,.78],[1400,.72],[1300,.68],[1200,.64],[1100,.60],[1000,.56]];
    let blob=null;
    let outputType="image/webp";

    try{
      for(const [side,quality] of webpPasses){
        const candidate=await renderImage(file,side,quality,"image/webp");
        if(candidate.type!=="image/webp")throw new Error("WEBP_UNSUPPORTED");
        blob=candidate;
        if(blob.size<=TARGET_IMAGE_BYTES)break;
      }
    }catch{
      blob=null;
      outputType="image/jpeg";
    }

    if(!blob||blob.size>TARGET_IMAGE_BYTES){
      if(outputType!=="image/jpeg"&&blob){
        // WebP Es Válido Aunque No Haya Alcanzado El Objetivo Exacto.
      }else{
        outputType="image/jpeg";
        for(const [side,quality] of jpegPasses){
          blob=await renderImage(file,side,quality,"image/jpeg");
          if(blob.size<=TARGET_IMAGE_BYTES)break;
        }
      }
    }

    if(!blob)throw new Error("No Se Pudo Optimizar La Imagen.");
    const extension=outputType==="image/webp"?"webp":"jpg";
    return new File([blob],`${safeBase(file.name)}.${extension}`,{type:outputType,lastModified:Date.now()});
  }

  if(file.size>MAX_LIBRARY_FILE_BYTES)throw new Error("El Archivo Supera El Máximo De 12 MB.");
  const ext=String(file.name||"").split(".").pop()?.toLowerCase()||"";
  const type=(!file.type||file.type==="application/octet-stream")?(MIME_BY_EXTENSION[ext]||""):file.type;
  if(!type)throw new Error("Ese Tipo De Archivo No Es Compatible.");
  return new File([file],file.name,{type,lastModified:file.lastModified||Date.now()});
}

export function trainingLibraryPath(userId,file){
  const safe=(file?.name||"material").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-110);
  return `${userId}/${Date.now()}-${safe}`;
}

export function isLibraryImage(item){
  return String(item?.mime_type||"").startsWith("image/");
}

export function materialIcon(item){
  if(item?.item_type==="link")return "🔗";
  const mime=String(item?.mime_type||"");
  if(mime.startsWith("image/"))return "🖼️";
  if(mime==="application/pdf")return "📄";
  if(mime.includes("word"))return "📝";
  if(mime.includes("sheet")||mime.includes("excel"))return "📊";
  if(mime.includes("presentation")||mime.includes("powerpoint"))return "📽️";
  return "📎";
}

export function compactBytes(bytes){
  const n=Number(bytes)||0;
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}
