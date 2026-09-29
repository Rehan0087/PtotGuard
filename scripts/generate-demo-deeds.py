"""Generate deterministic demo deed PDFs from the seeded parcel register."""

from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
SEED_SOURCE = ROOT / "apps" / "api" / "prisma" / "seed.ts"
OUTPUT_ROOT = ROOT / "public" / "documents"

PARCEL_RE = re.compile(
    r'id: "(?P<id>p-[^"]+)".*?dagNo: "(?P<dag>[^"]+)".*?'
    r'khatianNo: "(?P<khatian>[^"]+)".*?title: "(?P<title>[^"]+)".*?'
    r'ownerId: "(?P<owner_id>[^"]+)"'
)
USER_RE = re.compile(r'id: "(?P<id>usr-[^"]+)".*?name: "(?P<name>[^"]+)"')
DOCUMENT_RE = re.compile(
    r'parcelId: "(?P<parcel_id>p-[^"]+)".*?type: "(?P<type>[^"]+)".*?'
    r'fileName: "(?P<file_name>[^"]+)".*?mimeType: "application/pdf"'
)


def parse_parcels() -> dict[str, dict[str, str]]:
    parcels: dict[str, dict[str, str]] = {}
    source = SEED_SOURCE.read_text(encoding="utf-8")
    owner_names: dict[str, str] = {}
    for line in source.splitlines():
        user_match = USER_RE.search(line)
        if user_match:
            owner_names[user_match.group("id")] = user_match.group("name")
        match = PARCEL_RE.search(line)
        if match:
            parcel = match.groupdict()
            parcel["owner"] = owner_names.get(parcel["owner_id"], parcel["owner_id"])
            parcels[match.group("id")] = parcel
    return parcels


def parse_seed_documents() -> list[dict[str, str]]:
    source = SEED_SOURCE.read_text(encoding="utf-8")
    start = source.index("const rawDocuments")
    end = source.index("const parcelsWithDeeds", start)
    documents: list[dict[str, str]] = []
    for line in source[start:end].splitlines():
        match = DOCUMENT_RE.search(line)
        if match:
            documents.append(match.groupdict())
    return documents


def targets() -> list[tuple[Path, dict[str, str], str]]:
    parcels = parse_parcels()
    documents = parse_seed_documents()
    results: dict[Path, tuple[Path, dict[str, str], str]] = {}

    for document in documents:
        parcel = parcels.get(document["parcel_id"])
        if not parcel:
            continue
        path = OUTPUT_ROOT / document["parcel_id"] / document["file_name"]
        if not path.exists():
            results[path] = (path, parcel, document["type"])

    deed_parcels = {
        document["parcel_id"]
        for document in documents
        if document["type"] in {"sale-deed", "title-deed"}
    }
    for parcel_id, parcel in parcels.items():
        if parcel_id in deed_parcels:
            continue
        path = OUTPUT_ROOT / parcel_id / f"demo-deed-{parcel_id}.pdf"
        if not path.exists():
            results[path] = (path, parcel, "title-deed")

    return sorted(results.values(), key=lambda item: str(item[0]))


def draw_deed(path: Path, parcel: dict[str, str], document_type: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "DeedTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#123D32"),
        fontName="Helvetica-Bold",
        fontSize=19,
        leading=23,
        spaceAfter=4 * mm,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#5B665F"),
        fontSize=9,
        leading=12,
        spaceAfter=8 * mm,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#26332E"),
    )
    small = ParagraphStyle(
        "Small",
        parent=body,
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#66736D"),
    )

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#C8D1CC"))
        canvas.line(22 * mm, 17 * mm, A4[0] - 22 * mm, 17 * mm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#66736D"))
        canvas.drawString(22 * mm, 11 * mm, "VhumiShetu demo record - not a legal instrument")
        page_text = f"Page {doc.page}"
        canvas.drawRightString(A4[0] - 22 * mm, 11 * mm, page_text)
        canvas.restoreState()

    story = [
        Paragraph("DEMO LAND DEED", title),
        Paragraph(
            "Generated from the seeded parcel register for mutation-flow demonstration",
            subtitle,
        ),
        Table(
            [
                ["Parcel ID", parcel["id"]],
                ["Dag number", parcel["dag"]],
                ["Khatian number", parcel["khatian"]],
                ["Registered owner", parcel["owner"]],
                ["Land description", parcel["title"]],
                ["Document class", document_type.replace("-", " ").title()],
            ],
            colWidths=[43 * mm, 112 * mm],
            hAlign="LEFT",
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF1ED")),
                    ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#123D32")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C8D1CC")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ]
            ),
        ),
        Spacer(1, 9 * mm),
        Paragraph("Registry statement", styles["Heading2"]),
        Paragraph(
            "This demonstration deed identifies the parcel using the authoritative Dag and "
            "Khatian values stored in the application database. It is intended only as sample "
            "input for OCR extraction and land-officer review in the mutation workflow.",
            body,
        ),
        Spacer(1, 6 * mm),
        Paragraph("Review boundary", styles["Heading2"]),
        Paragraph(
            "Automated extraction may copy visible values from this file, but it does not approve, "
            "reject, or classify the mutation. Missing values must be entered by a land officer, "
            "who then chooses whether to accept the deed into the record or send it to fraud review.",
            body,
        ),
        Spacer(1, 14 * mm),
        Table(
            [["Citizen signature", "Land-office receipt"], ["", ""]],
            colWidths=[77.5 * mm, 77.5 * mm],
            rowHeights=[8 * mm, 25 * mm],
            style=TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#5B665F")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C8D1CC")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C8D1CC")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        ),
        Spacer(1, 7 * mm),
        Paragraph(
            f"Demo reference: DEED-{parcel['id'].upper()} | Source owner ID: {parcel['owner_id']}",
            small,
        ),
    ]

    document = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=23 * mm,
        title=f"Demo deed for {parcel['dag']}",
        author="VhumiShetu demo data generator",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    pending = targets()
    for path, parcel, document_type in pending:
        draw_deed(path, parcel, document_type)
        print(path.relative_to(ROOT))
    print(f"Generated {len(pending)} demo document(s).")


if __name__ == "__main__":
    main()
