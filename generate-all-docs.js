const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const DOLIL_DIR = path.join(__dirname, 'dolil image');
const PUBLIC_DOCS_DIR = path.join(__dirname, 'public', 'documents');

// Manually extract documents from seed.ts since we just need their filenames and types
const rawDocuments = [
    { id: "d-1", parcelId: "p-142", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-142-512.pdf", mimeType: "application/pdf", sizeBytes: 482103, pageCount: 4, uploadedAt: new Date("2026-07-18T11:20:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02, extractedFields: { "Dag No": "CS-142/3", Khatian: "512", Owner: "Ayesha Siddika" } },
    { id: "d-2", parcelId: "p-142", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-2015.pdf", mimeType: "application/pdf", sizeBytes: 903221, pageCount: 8, uploadedAt: new Date("2026-07-12T09:05:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.05 },
    { id: "d-3", parcelId: "p-088", ownerId: "usr-ayesha", type: "inheritance-affidavit", fileName: "warish-affidavit-088.pdf", mimeType: "application/pdf", sizeBytes: 221900, pageCount: 3, uploadedAt: new Date("2026-07-21T14:40:00Z"), uploadedById: "usr-ayesha", ocrStatus: "processing", verificationStatus: "unverified" },
    { id: "d-4", ownerId: "usr-ayesha", type: "id-proof", fileName: "nid-masked.jpg", mimeType: "image/jpeg", sizeBytes: 154002, uploadedAt: new Date("2026-07-10T08:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
    { id: "d-5", parcelId: "p-205", ownerId: "usr-shanti", type: "survey-report", fileName: "survey-205.pdf", mimeType: "application/pdf", sizeBytes: 671220, pageCount: 6, uploadedAt: new Date("2026-07-05T10:15:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.08 },
    { id: "d-6", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-scan.pdf", mimeType: "application/pdf", sizeBytes: 1120345, pageCount: 5, uploadedAt: new Date("2026-07-19T16:30:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.82, extractedFields: { "Dag No": "CS-176", "Stamp Value": "mismatch" } },
    { id: "d-7", parcelId: "p-311", ownerId: "usr-karim", type: "tax-receipt", fileName: "khajna-receipt-2026.pdf", mimeType: "application/pdf", sizeBytes: 88210, pageCount: 1, uploadedAt: new Date("2026-07-01T12:00:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-8", parcelId: "p-092", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-092-640.pdf", mimeType: "application/pdf", sizeBytes: 402100, pageCount: 4, uploadedAt: new Date("2026-07-22T09:30:00Z"), uploadedById: "usr-ayesha", ocrStatus: "pending", verificationStatus: "unverified" },
    { id: "d-9", parcelId: "p-088", type: "mutation-order", fileName: "namjari-order-088.pdf", mimeType: "application/pdf", sizeBytes: 210554, pageCount: 2, uploadedAt: new Date("2026-07-20T11:00:00Z"), uploadedById: "usr-officer", ocrStatus: "processing", verificationStatus: "unverified" },
    { id: "d-10", parcelId: "p-205", type: "court-order", fileName: "court-order-205.pdf", mimeType: "application/pdf", sizeBytes: 512000, pageCount: 7, uploadedAt: new Date("2026-06-28T15:20:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-11", parcelId: "p-176", ownerId: "usr-karim", type: "sale-deed", fileName: "dolil-176-alt.pdf", mimeType: "application/pdf", sizeBytes: 980112, pageCount: 5, uploadedAt: new Date("2026-07-20T10:10:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.67, extractedFields: { "Dag No": "CS-176", Signature: "possible forgery" } },
    { id: "d-12", parcelId: "p-311", ownerId: "usr-karim", type: "survey-report", fileName: "survey-311-amin.pdf", mimeType: "application/pdf", sizeBytes: 733410, pageCount: 4, uploadedAt: new Date("2026-07-23T08:45:00Z"), uploadedById: "usr-officer2", ocrStatus: "extracted", verificationStatus: "unverified", extractedFields: { "Dag No": "RS-311/7", Khatian: "355", Area: "3 katha" } },
    { id: "d-13", parcelId: "p-176", ownerId: "usr-karim", type: "title-deed", fileName: "khatian-176-photo.jpg", mimeType: "image/jpeg", sizeBytes: 3204118, uploadedAt: new Date("2026-07-24T17:05:00Z"), uploadedById: "usr-karim", ocrStatus: "failed", verificationStatus: "unverified" },
    { id: "d-14", parcelId: "p-401", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-401-701.pdf", mimeType: "application/pdf", sizeBytes: 388120, pageCount: 3, uploadedAt: new Date("2026-08-10T09:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01, extractedFields: { "Dag No": "RS-401", Khatian: "701", Owner: "Ayesha Siddika" } },
    { id: "d-15", parcelId: "p-402", ownerId: "usr-karim", type: "sale-deed", fileName: "sale-deed-402.pdf", mimeType: "application/pdf", sizeBytes: 612480, pageCount: 6, uploadedAt: new Date("2026-09-05T08:30:00Z"), uploadedById: "usr-karim", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.03, extractedFields: { "Dag No": "RS-402", Khatian: "702", Owner: "Md. Karim Uddin" } },
    { id: "d-16", parcelId: "p-403", ownerId: "usr-ayesha", type: "survey-report", fileName: "boundary-survey-403.pdf", mimeType: "application/pdf", sizeBytes: 544210, pageCount: 5, uploadedAt: new Date("2026-09-07T07:00:00Z"), uploadedById: "usr-agent", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.02 },
    { id: "d-17", parcelId: "p-404", ownerId: "usr-iqbal", type: "title-deed", fileName: "deed-404-scan.pdf", mimeType: "application/pdf", sizeBytes: 721330, pageCount: 7, uploadedAt: new Date("2026-09-08T10:15:00Z"), uploadedById: "usr-iqbal", ocrStatus: "extracted", verificationStatus: "flagged", fraudScore: 0.86, extractedFields: { "Dag No": "RS-440", Khatian: "704", Owner: "Iqbal Enterprise" } },
    { id: "d-18", parcelId: "p-405", ownerId: "usr-karim", type: "mutation-order", fileName: "mutation-order-405.pdf", mimeType: "application/pdf", sizeBytes: 264900, pageCount: 2, uploadedAt: new Date("2026-08-28T10:05:00Z"), uploadedById: "usr-officer", ocrStatus: "extracted", verificationStatus: "verified", fraudScore: 0.01 },
    { id: "d-801", parcelId: "p-801", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-801.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 4, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-802", parcelId: "p-802", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-802.pdf", mimeType: "application/pdf", sizeBytes: 420411, pageCount: 3, uploadedAt: new Date("2026-08-02T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-803", parcelId: "p-803", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-803.pdf", mimeType: "application/pdf", sizeBytes: 620411, pageCount: 5, uploadedAt: new Date("2026-08-03T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-804", parcelId: "p-804", ownerId: "usr-ayesha", type: "title-deed", fileName: "dolil-804.pdf", mimeType: "application/pdf", sizeBytes: 320411, pageCount: 2, uploadedAt: new Date("2026-08-04T10:00:00Z"), uploadedById: "usr-ayesha", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-888", parcelId: "p-888", ownerId: "usr-ayesha", type: "title-deed", fileName: "khatian-888.pdf", mimeType: "application/pdf", sizeBytes: 482103, pageCount: 4, uploadedAt: new Date("2026-08-18T11:20:00Z"), uploadedById: "usr-ayesha", ocrStatus: "failed", verificationStatus: "unverified" },
    { id: "d-999", parcelId: "p-999", ownerId: "usr-ayesha", type: "sale-deed", fileName: "dolil-999.pdf", mimeType: "application/pdf", sizeBytes: 903221, pageCount: 8, uploadedAt: new Date("2026-08-12T09:05:00Z"), uploadedById: "usr-ayesha", ocrStatus: "processing", verificationStatus: "unverified" },
    { id: "d-d2-1", parcelId: "p-d2-1", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-d2-2", parcelId: "p-d2-2", ownerId: "usr-fatema", type: "sale-deed", fileName: "dolil-d2-2.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-fatema", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-d3-1", parcelId: "p-d3-1", ownerId: "usr-rashed", type: "sale-deed", fileName: "dolil-d3-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-rashed", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-d4-1", parcelId: "p-d4-1", ownerId: "usr-noor", type: "sale-deed", fileName: "dolil-d4-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-noor", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-d5-1", parcelId: "p-d5-1", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-1.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified" },
    { id: "d-d5-2", parcelId: "p-d5-2", ownerId: "usr-habib", type: "sale-deed", fileName: "dolil-d5-2.pdf", mimeType: "application/pdf", sizeBytes: 520411, pageCount: 2, uploadedAt: new Date("2026-08-01T10:00:00Z"), uploadedById: "usr-habib", ocrStatus: "extracted", verificationStatus: "verified" },
  ];

async function main() {
  const allImages = fs.readdirSync(DOLIL_DIR).filter(f => f.endsWith('.png'));
  const firstPageImageName = 'image.png';
  const otherImages = allImages.filter(f => f !== firstPageImageName);
  const firstPageImgBytes = fs.readFileSync(path.join(DOLIL_DIR, firstPageImageName));

  if (!fs.existsSync(PUBLIC_DOCS_DIR)) {
    fs.mkdirSync(PUBLIC_DOCS_DIR, { recursive: true });
  }

  for (const doc of rawDocuments) {
    const pId = doc.parcelId || 'general';
    const landDir = path.join(PUBLIC_DOCS_DIR, pId);
    if (!fs.existsSync(landDir)) {
      fs.mkdirSync(landDir, { recursive: true });
    }

    const filePath = path.join(landDir, doc.fileName);

    if (doc.mimeType === 'image/jpeg' || doc.fileName.endsWith('.jpg')) {
      // Create copy of the first page as JPG placeholder
      fs.copyFileSync(path.join(DOLIL_DIR, firstPageImageName), filePath);
    } else {
      // Generate PDF
      const pdfDoc = await PDFDocument.create();
      
      const firstImage = await pdfDoc.embedPng(firstPageImgBytes);
      const page1 = pdfDoc.addPage([firstImage.width, firstImage.height]);
      page1.drawImage(firstImage, { x: 0, y: 0, width: firstImage.width, height: firstImage.height });

      const pageCount = doc.pageCount || 2;

      for(let i=1; i<pageCount; i++){
        const randomImageName = otherImages[Math.floor(Math.random() * otherImages.length)];
        const randomImgBytes = fs.readFileSync(path.join(DOLIL_DIR, randomImageName));
        const randomImage = await pdfDoc.embedPng(randomImgBytes);
        const page = pdfDoc.addPage([randomImage.width, randomImage.height]);
        page.drawImage(randomImage, { x: 0, y: 0, width: randomImage.width, height: randomImage.height });
      }

      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(filePath, pdfBytes);
      fs.writeFileSync(path.join(landDir, 'dolil.pdf'), pdfBytes);
    }

    console.log(`Generated file for ${doc.fileName}`);
  }

  console.log("All missing documents generated successfully.");
}

main().catch(console.error);
