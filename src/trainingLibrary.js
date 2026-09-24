const MAX_LIBRARY_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 450 * 1024;

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

function canvasBlob(canvas,quality){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("No Se Pudo Optimizar La Imagen.")),"image/jpeg",quality);
  });
}

async function renderImage(file,maxSide,quality){
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
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvasBlob(canvas,quality);
}

export async function prepareTrainingLibraryFile(file){
  if(!file)throw new Error("Seleccioná Un Archivo.");

  if(String(file.type||"").startsWith("image/")){
    if(file.size>MAX_SOURCE_IMAGE_BYTES)throw new Error("La Imagen Es Demasiado Grande. Elegí Una De Menos De 20 MB.");
    const passes=[[1600,.82],[1400,.76],[1200,.70],[1000,.64],[900,.58],[800,.52]];
    let blob=null;
    for(const [side,quality] of passes){
      blob=await renderImage(file,side,quality);
      if(blob.size<=TARGET_IMAGE_BYTES)break;
    }
    if(!blob)throw new Error("No Se Pudo Optimizar La Imagen.");
    return new File([blob],`${safeBase(file.name)}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
  }

  if(file.size>MAX_LIBRARY_FILE_BYTES)throw new Error("El Archivo Supera El Máximo De 12 MB.");
  const ext=String(file.name||"").split(".").pop()?.toLowerCase()||"";
  const type=file.type||MIME_BY_EXTENSION[ext]||"";
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
