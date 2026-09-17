const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const DOLIL_DIR = path.join(__dirname, 'dolil image');
const PUBLIC_DOCS_DIR = path.join(__dirname, 'public', 'documents');

const documents = [
  { parcelId: "p-142", fileName: "khatian-142-512.pdf" },
  { parcelId: "p-142", fileName: "dolil-2015.pdf" },
  { parcelId: "p-088", fileName: "warish-affidavit-088.pdf" },
  { parcelId: "p-205", fileName: "survey-205.pdf" },
  { parcelId: "p-176", fileName: "dolil-176-scan.pdf" },
  { parcelId: "p-311", fileName: "khajna-receipt-2026.pdf" },
  { parcelId: "p-092", fileName: "khatian-092-640.pdf" },
  { parcelId: "p-088", fileName: "namjari-order-088.pdf" },
  { parcelId: "p-205", fileName: "court-order-205.pdf" },
  { parcelId: "p-176", fileName: "dolil-176-alt.pdf" },
  { parcelId: "p-311", fileName: "survey-311-amin.pdf" },
  { parcelId: "p-401", fileName: "khatian-401-701.pdf" },
  { parcelId: "p-402", fileName: "sale-deed-402.pdf" },
  { parcelId: "p-403", fileName: "boundary-survey-403.pdf" },
  { parcelId: "p-404", fileName: "deed-404-scan.pdf" },
  { parcelId: "p-405", fileName: "mutation-order-405.pdf" },
  { parcelId: "p-801", fileName: "dolil-801.pdf" },
  { parcelId: "p-802", fileName: "dolil-802.pdf" },
  { parcelId: "p-803", fileName: "dolil-803.pdf" },
  { parcelId: "p-804", fileName: "dolil-804.pdf" },
  { parcelId: "p-888", fileName: "khatian-888.pdf" },
  { parcelId: "p-999", fileName: "dolil-999.pdf" },
];

async function main() {
  const allImages = fs.readdirSync(DOLIL_DIR).filter(f => f.endsWith('.png'));
  const firstPageImageName = 'image.png';
  const otherImages = allImages.filter(f => f !== firstPageImageName);

  if (!fs.existsSync(PUBLIC_DOCS_DIR)) {
    fs.mkdirSync(PUBLIC_DOCS_DIR, { recursive: true });
  }

  const firstPageImgBytes = fs.readFileSync(path.join(DOLIL_DIR, firstPageImageName));

  for (const doc of documents) {
    const pdfDoc = await PDFDocument.create();
    
    // Page 1
    const firstImage = await pdfDoc.embedPng(firstPageImgBytes);
    const page1 = pdfDoc.addPage([firstImage.width, firstImage.height]);
    page1.drawImage(firstImage, {
      x: 0,
      y: 0,
      width: firstImage.width,
      height: firstImage.height,
    });

    // Page 2
    const randomImageName = otherImages[Math.floor(Math.random() * otherImages.length)];
    const randomImgBytes = fs.readFileSync(path.join(DOLIL_DIR, randomImageName));
    const randomImage = await pdfDoc.embedPng(randomImgBytes);
    const page2 = pdfDoc.addPage([randomImage.width, randomImage.height]);
    page2.drawImage(randomImage, {
      x: 0,
      y: 0,
      width: randomImage.width,
      height: randomImage.height,
    });

    const pdfBytes = await pdfDoc.save();
    
    const landDir = path.join(PUBLIC_DOCS_DIR, doc.parcelId);
    if (!fs.existsSync(landDir)) {
      fs.mkdirSync(landDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(landDir, doc.fileName), pdfBytes);
    
    // Also save as dolil.pdf to fulfill the user requirement strictly.
    fs.writeFileSync(path.join(landDir, 'dolil.pdf'), pdfBytes);

    console.log(`Generated ${doc.fileName} for ${doc.parcelId}`);
  }
}

main().catch(console.error);
