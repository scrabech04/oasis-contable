import json
import sqlite3
from pathlib import Path


TABLES = [
    "AccountProfile",
    "CompanySettings",
    "CompanyIdentity",
    "Contact",
    "ContactPerson",
    "Project",
    "ProjectShare",
    "NumberingSequence",
    "RecurringInvoice",
    "RecurringInvoiceItem",
    "Quotation",
    "QuotationItem",
    "Invoice",
    "InvoiceItem",
    "Purchase",
    "PurchaseItem",
    "PurchaseAttachment",
    "Payment",
    "Withholding",
    "Subscription",
]


def main():
    root = Path(__file__).resolve().parents[1]
    db_path = root / "prisma" / "dev.db"
    out_path = root / "tmp_migration" / "sqlite-export.json"
    out_path.parent.mkdir(exist_ok=True)

    if not db_path.exists():
        raise SystemExit(f"No existe la base local: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    payload = {"source": str(db_path), "tables": {}}
    for table in TABLES:
        rows = conn.execute(f'SELECT * FROM "{table}" ORDER BY "id"').fetchall()
        payload["tables"][table] = [dict(row) for row in rows]

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Exportado a: {out_path}")
    for table in TABLES:
        print(f"{table}: {len(payload['tables'][table])}")


if __name__ == "__main__":
    main()
