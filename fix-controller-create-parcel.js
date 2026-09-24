const fs = require('fs');

const path = 'apps/api/src/service-applications/service-applications.controller.ts';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `        } else if (status === "approved") {
          await tx.khasLandPlot.update({
            where: { id: application.khasPlotId },
            data: { status: "leased" },
          });
        }`;

const replacementStr = `        } else if (status === "approved") {
          const plot = await tx.khasLandPlot.update({
            where: { id: application.khasPlotId },
            data: { status: "leased" },
          });
          const jurisdiction = await tx.jurisdiction.findFirst({
            where: { district: plot.district, upazila: plot.upazila, mouza: plot.mouza },
          });
          if (jurisdiction) {
            const parcelId = \`p-\${randomUUID()}\`;
            await tx.parcel.create({
              data: {
                id: parcelId,
                dagNo: plot.dagNo,
                khatianNo: \`LEASE-\${updated.applicationNo}\`,
                title: \`Leased Khas Land (Dag \${plot.dagNo})\`,
                jurisdictionId: jurisdiction.id,
                landUse: plot.landUse,
                area: { value: plot.areaDecimals, unit: "decimal" },
                ownerId: updated.applicantId,
                ownershipType: "sole",
                registryStatus: "registered",
                centroid: { lat: plot.centroidLat, lng: plot.centroidLng },
                boundary: plot.boundaryGeoJson,
                registeredAt: now,
              }
            });
            await tx.ownershipRecord.create({
              data: {
                id: \`or-\${randomUUID()}\`,
                parcelId: parcelId,
                ownerId: updated.applicantId,
                ownerName: actor?.name || "Leaseholder",
                acquisitionType: "grant",
                fromDate: now,
              }
            });
          }
        }`;

if (!code.includes(targetStr)) {
  console.log("Could not find target string.");
} else {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync(path, code);
  console.log("Updated ServiceApplicationsController successfully!");
}
