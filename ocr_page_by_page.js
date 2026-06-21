const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = `reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        const form=new URLSearchParams();
        form.append("apikey","K85147389088957");
        form.append("base64Image","data:"+(file.type||"application/pdf")+";base64,"+b64);
        form.append("filetype",file.type==="application/pdf"?"PDF":"Auto");
        form.append("OCREngine","2");
        form.append("isTable","true");
        const ocrRes=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:form});
        const ocrData=await ocrRes.json();
        if(ocrData.IsErroredOnProcessing) throw new Error(ocrData.ErrorMessage?.[0]||"Erreur OCR");
        const text=ocrData.ParsedResults?.map(r=>r.ParsedText).join("\\n")||"";
        console.log("TEXTE OCR:",text);`;

const newBlock = `reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        // Fonction OCR d'une image base64 via OCR.space
        const ocrPage=async(imageB64,mimeType)=>{
          const form=new URLSearchParams();
          form.append("apikey","K85147389088957");
          form.append("base64Image","data:"+mimeType+";base64,"+imageB64);
          form.append("filetype","Auto");
          form.append("OCREngine","2");
          form.append("isTable","true");
          const res=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:form});
          const data=await res.json();
          if(data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0]||"Erreur OCR");
          return data.ParsedResults?.map(r=>r.ParsedText).join("\\n")||"";
        };

        let text="";
        if(file.type==="application/pdf"){
          // Charger le PDF avec pdfjs-dist et OCRiser page par page
          const pdfjsLib=await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.mjs",import.meta.url).toString();
          const pdfData=atob(b64);
          const pdfBytes=new Uint8Array(pdfData.length);
          for(let i=0;i<pdfData.length;i++) pdfBytes[i]=pdfData.charCodeAt(i);
          const pdf=await pdfjsLib.getDocument({data:pdfBytes}).promise;
          const numPages=pdf.numPages;
          const texts=[];
          for(let pageNum=1;pageNum<=numPages;pageNum++){
            const page=await pdf.getPage(pageNum);
            const scale=2.0; // haute résolution pour meilleur OCR
            const viewport=page.getViewport({scale});
            const canvas=document.createElement("canvas");
            canvas.width=viewport.width;
            canvas.height=viewport.height;
            const ctx=canvas.getContext("2d");
            await page.render({canvasContext:ctx,viewport}).promise;
            const pageB64=canvas.toDataURL("image/png").split(",")[1];
            const pageText=await ocrPage(pageB64,"image/png");
            texts.push(pageText);
          }
          text=texts.join("\\n");
        }else{
          // Image directe
          text=await ocrPage(b64,file.type||"image/jpeg");
        }
        console.log("TEXTE OCR:",text);`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - OCR page par page avec pdfjs-dist');
} else {
  console.log('ERREUR - bloc non trouve');
}
