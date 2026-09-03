#!/usr/bin/env python3
"""Convert WooCommerce order export to Matrixify Orders.csv."""

from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

WOO_ORDERS = Path("/Users/thombennett/Downloads/orders-2026-09-02-13-08-16.csv")
SHOPIFY_PRODUCTS = Path("/Users/thombennett/Downloads/products_export 4.csv")
OUT_FULL = Path("/Users/thombennett/Downloads/Orders.csv")
OUT_REPO = Path("/Users/thombennett/Documents/GitHub/norvegr-new/Orders.csv")
OUT_SAMPLE = Path("/Users/thombennett/Downloads/Orders-sample.csv")
OUT_SAMPLE_20 = Path("/Users/thombennett/Downloads/Orders-sample-20.csv")
OUT_SAMPLE_20_REPO = Path("/Users/thombennett/Documents/GitHub/norvegr-new/Orders-sample-20.csv")
OUT_DELETE_TEST = Path("/Users/thombennett/Downloads/Orders-delete-test.csv")
OUT_REPORT = Path("/Users/thombennett/Documents/GitHub/norvegr-new/orders-import-report.txt")
OUT_REPORT_DL = Path("/Users/thombennett/Downloads/orders-import-report.txt")

TEST_ORDER_NAMES = [
    "WOO-1",
    "WOO-2",
    "WOO-3",
    "WOO-5",
    "WOO-6",
    "WOO-7",
    "WOO-8",
    "WOO-9",
    "WOO-11",
    "WOO-12",
]

# Orphan orders from failed early imports (Shopify-assigned names, not WOO-*)
ORPHAN_ORDER_NAMES = [
    "#1001",
    "#1002",
]

SKIP_EMAILS = {
    "info@tbgd.co.uk",
    "t.bennett@theliftagency.com",
}

HEADERS = [
    "Name",
    "Number",
    "Command",
    "Send Receipt",
    "Inventory Behaviour",
    "Processed At",
    "Currency",
    "Source",
    "Tags",
    "Note",
    "Email",
    "Phone",
    "Payment: Status",
    "Customer: Email",
    "Customer: First Name",
    "Customer: Last Name",
    "Billing: First Name",
    "Billing: Last Name",
    "Billing: Company",
    "Billing: Address 1",
    "Billing: City",
    "Billing: Province Code",
    "Billing: Zip",
    "Billing: Country Code",
    "Billing: Phone",
    "Shipping: First Name",
    "Shipping: Last Name",
    "Shipping: Address 1",
    "Shipping: City",
    "Shipping: Province Code",
    "Shipping: Zip",
    "Shipping: Country Code",
    "Shipping: Phone",
    "Line: Type",
    "Line: ID",
    "Line: Title",
    "Line: Product Handle",
    "Line: SKU",
    "Line: Quantity",
    "Line: Price",
    "Line: Requires Shipping",
    "Line: Taxable",
    "Fulfillment: ID",
    "Fulfillment: Status",
    "Fulfillment: Shipment Status",
    "Fulfillment: Processed At",
    "Shipping Line: Title",
    "Shipping Line: Price",
    "Transaction: Kind",
    "Transaction: Processed At",
    "Transaction: Amount",
    "Transaction: Currency",
    "Transaction: Status",
]


def norm(text: str) -> str:
    text = (text or "").strip().lower()
    text = text.replace("–", "-").replace("’", "'")
    text = re.sub(r"\s+", " ", text)
    return text


def money(value: str) -> float:
    try:
        return float((value or "0").replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def fmt_date(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) == 16:
        return f"{value}:00 +0000"
    return value


def fmt_phone(value: str, country_code: str = "") -> str:
    value = (value or "").strip()
    if not value:
        return ""

    digits = re.sub(r"\D", "", value)
    if not digits:
        return ""

    if digits.startswith("00"):
        digits = digits[2:]

    country = (country_code or "").upper()
    if country in {"US", "CA"}:
        if len(digits) == 10:
            digits = f"1{digits}"
        elif len(digits) == 11 and digits.startswith("1"):
            pass
        else:
            return ""
    elif country == "GB":
        if digits.startswith("44"):
            pass
        elif digits.startswith("0"):
            rest = digits[1:]
            digits = rest if rest.startswith("44") else f"44{rest}"
        elif len(digits) == 10:
            digits = f"44{digits}"
        else:
            return ""
    elif not digits.startswith("00") and len(digits) < 10:
        return ""

    if len(digits) < 10:
        return ""

    return f"'+{digits}"


def load_product_lookup(path: Path) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    current_title = ""

    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if (row.get("Title") or "").strip():
                current_title = row["Title"].strip()

            handle_name = (row.get("Handle") or "").strip()
            option1 = (row.get("Option1 Value") or "").strip()
            option2 = (row.get("Option2 Value") or "").strip()
            sku = (row.get("Variant SKU") or "").strip()

            keys = set()
            if option1 and option2:
                keys.add(norm(f"{current_title} - {option1} - {option2}"))
                keys.add(norm(f"{current_title} - {option1}, {option2}"))
            elif option1:
                keys.add(norm(f"{current_title} - {option1}"))

            # Only map exact variant titles. Base product titles are ambiguous.
            if len(keys) == 1 and not option1:
                keys.add(norm(current_title))

            for key in keys:
                lookup[key] = {
                    "handle": handle_name,
                    "sku": sku,
                    "title": current_title,
                }

    return lookup


def match_product(item_name: str, lookup: dict[str, dict]) -> dict | None:
    item_name = (item_name or "").strip()
    if not item_name:
        return None

    normalized = norm(item_name)
    if normalized in lookup:
        return lookup[normalized]

    # Woo sometimes drops the long product suffix on eiderdown orders.
    aliases = {
        norm("Norwegian Eiderdown Duvet"): norm(
            "Norwegian Eiderdown Duvet, Hand picked, limited supply"
        ),
    }
    if normalized in aliases and aliases[normalized] in lookup:
        return lookup[aliases[normalized]]

    return None


def payment_status(woo_status: str) -> str:
    status = (woo_status or "").strip().lower()
    if status == "pending payment":
        return "pending"
    if status in {"cancelled", "canceled", "failed", "refunded"}:
        return "voided"
    return "paid"


def should_fulfill(woo_status: str, payment: str) -> bool:
    status = (woo_status or "").strip().lower()
    if payment != "paid":
        return False
    return status in {"completed", "processing"}


def blank_row() -> dict:
    return {header: "" for header in HEADERS}


def valid_email(value: str) -> bool:
    value = (value or "").strip()
    if not value:
        return False
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value) is not None


def sanitize_email(email: str, order_number: str, note: str) -> tuple[str, str]:
    """Return email safe for Shopify import and updated note if adjusted."""
    email = (email or "").strip().lower()
    if valid_email(email):
        return email, note

    note = f"{note} Original email: {email}.".strip()
    fallback = f"woo-{order_number}@orders.norvegr.com"
    return fallback, note


def address_fields(first: dict, kind: str) -> dict[str, str]:
    prefix = "Billing" if kind == "billing" else "Shipping"
    other = "Shipping" if kind == "billing" else "Billing"

    def get(field: str, source: str) -> str:
        return (first.get(f"{field} ({source})") or "").strip()

    first_name = get("First Name", prefix) or get("First Name", other)
    last_name = get("Last Name", prefix) or get("Last Name", other) or first_name or "Customer"
    address_1 = get("Address 1&2", prefix) or get("Address 1&2", other) or "Address not recorded"
    city = get("City", prefix) or get("City", other) or "City not recorded"
    province = get("State Code", prefix) or get("State Code", other)
    zip_code = get("Postcode", prefix) or get("Postcode", other)
    country = (get("Country Code", prefix) or get("Country Code", other)).upper()

    return {
        "first_name": first_name,
        "last_name": last_name,
        "address_1": address_1,
        "city": city,
        "province": province,
        "zip": zip_code,
        "country": country,
    }


def build_orders() -> tuple[list[dict], dict]:
    lookup = load_product_lookup(SHOPIFY_PRODUCTS)

    with WOO_ORDERS.open(newline="", encoding="utf-8-sig") as handle:
        woo_rows = list(csv.DictReader(handle))

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in woo_rows:
        email = (row.get("Email (Billing)") or "").strip().lower()
        if email in SKIP_EMAILS:
            continue
        grouped[row["Order Number"]].append(row)

    output_rows: list[dict] = []
    stats = {
        "orders": 0,
        "line_items": 0,
        "matched_products": 0,
        "custom_line_items": 0,
        "service_orders": 0,
        "skipped_orders": 0,
        "fixed_addresses": 0,
        "fixed_emails": 0,
        "blank_phones": 0,
        "unmatched_names": Counter(),
    }

    for order_number in sorted(grouped.keys(), key=lambda value: int(value)):
        rows = grouped[order_number]
        first = rows[0]
        raw_email = (first.get("Email (Billing)") or "").strip()
        if not raw_email:
            stats["skipped_orders"] += 1
            continue

        stats["orders"] += 1
        order_name = f"WOO-{order_number}"
        processed_at = fmt_date(first.get("Order Date", ""))
        payment = payment_status(first.get("Order Status", ""))
        fulfill = should_fulfill(first.get("Order Status", ""), payment)
        shipping_amount = money(first.get("Order Shipping Amount"))
        order_total = money(first.get("Order Total Amount"))
        refund_amount = money(first.get("Order Refund Amount"))
        shipping_title = (first.get("Shipping Method Title") or "Shipping").strip()
        customer_note = (first.get("Customer Note") or "").strip()
        note = "Imported from WooCommerce."
        if customer_note:
            note = f"{note} {customer_note}"

        email, note = sanitize_email(raw_email, order_number, note)
        if email != raw_email:
            stats["fixed_emails"] += 1

        line_items = []
        for index, row in enumerate(rows, start=1):
            item_name = (row.get("Item Name") or "").strip()
            quantity = row.get("Quantity (- Refund)", "").strip()
            qty = int(float(quantity)) if quantity else 0
            unit_price = money(row.get("Item Cost"))

            if not item_name:
                continue

            product = match_product(item_name, lookup)
            line = {
                "title": item_name,
                "handle": "",
                "sku": "",
                "quantity": qty or 1,
                "price": unit_price,
                "line_id": int(order_number) * 100 + index,
            }

            if product:
                line["handle"] = product["handle"]
                line["sku"] = product["sku"]
                stats["matched_products"] += 1
            else:
                stats["custom_line_items"] += 1
                stats["unmatched_names"][item_name] += 1

            line_items.append(line)
            stats["line_items"] += 1

        if not line_items:
            stats["service_orders"] += 1
            subtotal = money(first.get("Order Subtotal Amount"))
            line_total = subtotal if subtotal > 0 else max(order_total - shipping_amount, 0)
            line_items.append(
                {
                    "title": "WooCommerce historical order",
                    "handle": "",
                    "sku": "",
                    "quantity": 1,
                    "price": line_total,
                    "line_id": int(order_number) * 100 + 1,
                }
            )
            stats["line_items"] += 1
            stats["custom_line_items"] += 1

        fulfillment_id = str(int(order_number)) if fulfill else ""
        order_number_value = str(int(order_number))
        billing = address_fields(first, "billing")
        shipping = address_fields(first, "shipping")

        raw_billing = {
            "first_name": (first.get("First Name (Billing)") or "").strip(),
            "last_name": (first.get("Last Name (Billing)") or "").strip(),
            "address_1": (first.get("Address 1&2 (Billing)") or "").strip(),
            "city": (first.get("City (Billing)") or "").strip(),
            "country": (first.get("Country Code (Billing)") or "").strip().upper(),
        }
        raw_shipping = {
            "first_name": (first.get("First Name (Shipping)") or "").strip(),
            "last_name": (first.get("Last Name (Shipping)") or "").strip(),
            "address_1": (first.get("Address 1&2 (Shipping)") or "").strip(),
            "city": (first.get("City (Shipping)") or "").strip(),
            "country": (first.get("Country Code (Shipping)") or "").strip().upper(),
        }
        if (
            billing["last_name"] != raw_billing["last_name"]
            or billing["address_1"] != raw_billing["address_1"]
            or billing["city"] != raw_billing["city"]
            or shipping["last_name"] != raw_shipping["last_name"]
            or shipping["address_1"] != raw_shipping["address_1"]
            or shipping["city"] != raw_shipping["city"]
        ):
            stats["fixed_addresses"] += 1

        billing_phone = fmt_phone(first.get("Phone (Billing)", ""), billing["country"])
        shipping_phone = fmt_phone(first.get("Phone (Shipping)", ""), shipping["country"])
        if not billing_phone and first.get("Phone (Billing)", "").strip():
            stats["blank_phones"] += 1
        if not shipping_phone and first.get("Phone (Shipping)", "").strip():
            stats["blank_phones"] += 1

        order_header = {
            "Name": order_name,
            "Number": order_number_value,
            "Command": "NEW",
            "Send Receipt": "FALSE",
            "Inventory Behaviour": "bypass",
            "Processed At": processed_at,
            "Currency": "USD",
            "Source": "WooCommerce",
            "Tags": "WooCommerce",
            "Note": note,
            "Email": email,
            "Phone": "",
            "Payment: Status": payment,
            "Customer: Email": email,
            "Billing: First Name": billing["first_name"],
            "Billing: Last Name": billing["last_name"],
            "Billing: Company": (first.get("Company (Billing)") or "").strip(),
            "Billing: Address 1": billing["address_1"],
            "Billing: City": billing["city"],
            "Billing: Province Code": billing["province"],
            "Billing: Zip": billing["zip"],
            "Billing: Country Code": billing["country"],
            "Billing: Phone": "",
            "Shipping: First Name": shipping["first_name"],
            "Shipping: Last Name": shipping["last_name"],
            "Shipping: Address 1": shipping["address_1"],
            "Shipping: City": shipping["city"],
            "Shipping: Province Code": shipping["province"],
            "Shipping: Zip": shipping["zip"],
            "Shipping: Country Code": shipping["country"],
            "Shipping: Phone": "",
        }

        if shipping_amount > 0:
            order_header["Shipping Line: Title"] = shipping_title[:255]
            order_header["Shipping Line: Price"] = f"{shipping_amount:.2f}"

        line_subtotal = sum(line["quantity"] * line["price"] for line in line_items)
        calculated_total = max(line_subtotal + shipping_amount - refund_amount, 0)
        paid_amount = 0.0
        woo_total = max(order_total - refund_amount, 0)
        if payment == "paid":
            paid_amount = calculated_total if calculated_total > 0 else woo_total
        if payment == "paid" and woo_total and abs(woo_total - calculated_total) > 0.05:
            stats.setdefault("total_mismatches", []).append(
                f"WOO-{order_number}: woo={woo_total:.2f} calculated={calculated_total:.2f}"
            )

        for index, line in enumerate(line_items):
            row = blank_row()
            row["Name"] = order_name
            row["Number"] = order_number_value
            if index == 0:
                row.update(order_header)
                if payment == "paid" and paid_amount > 0:
                    row.update(
                        {
                            "Transaction: Kind": "sale",
                            "Transaction: Processed At": processed_at,
                            "Transaction: Amount": f"{paid_amount:.2f}",
                            "Transaction: Currency": "USD",
                            "Transaction: Status": "success",
                        }
                    )

            row.update(
                {
                    "Line: Type": "Line Item",
                    "Line: ID": str(line["line_id"]),
                    "Line: Title": line["title"],
                    "Line: Product Handle": line["handle"],
                    "Line: SKU": line["sku"],
                    "Line: Quantity": str(line["quantity"]),
                    "Line: Price": f"{line['price']:.2f}",
                    "Line: Requires Shipping": "TRUE",
                    "Line: Taxable": "FALSE",
                }
            )

            if fulfill:
                row["Fulfillment: ID"] = fulfillment_id
                row["Fulfillment: Status"] = "success"
                row["Fulfillment: Shipment Status"] = "delivered"
                row["Fulfillment: Processed At"] = processed_at

            output_rows.append(row)

    return output_rows, stats


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)


def write_sample(rows: list[dict], count: int = 10) -> list[dict]:
    order_numbers: list[str] = []
    for row in rows:
        number = row.get("Number", "").strip()
        if number and number not in order_numbers:
            order_numbers.append(number)
        if len(order_numbers) >= count:
            break

    sample_numbers = set(order_numbers[:count])
    return [row for row in rows if row.get("Number", "").strip() in sample_numbers]


def write_delete_test_orders(path: Path) -> None:
    names = TEST_ORDER_NAMES + ORPHAN_ORDER_NAMES
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Name", "Command"])
        writer.writeheader()
        for name in names:
            writer.writerow({"Name": name, "Command": "DELETE"})


def main() -> None:
    rows, stats = build_orders()
    write_csv(OUT_FULL, rows)
    write_csv(OUT_REPO, rows)

    sample_rows = write_sample(rows, 10)
    write_csv(OUT_SAMPLE, sample_rows)
    sample_rows_20 = write_sample(rows, 20)
    write_csv(OUT_SAMPLE_20, sample_rows_20)
    write_csv(OUT_SAMPLE_20_REPO, sample_rows_20)
    write_delete_test_orders(OUT_DELETE_TEST)

    unmatched = stats["unmatched_names"]
    report_lines = [
        "Norvegr WooCommerce -> Shopify Orders import",
        "===========================================",
        f"Orders exported: {stats['orders']}",
        f"Line items: {stats['line_items']}",
        f"Product-linked line items: {stats['matched_products']}",
        f"Custom/historical line items: {stats['custom_line_items']}",
        f"Service orders (no Woo line items): {stats['service_orders']}",
        f"Skipped orders (missing email): {stats['skipped_orders']}",
        f"Addresses normalised: {stats['fixed_addresses']}",
        f"Emails normalised: {stats['fixed_emails']}",
        f"Invalid phones left blank: {stats['blank_phones']}",
        "",
        "Import fixes: Name on all rows, inline sale transaction on first line item,",
        "customer linked by Customer: Email only, address fallbacks for incomplete Woo data.",
        "",
        "Files:",
        f"  Full import: {OUT_FULL}",
        f"  Repo copy:   {OUT_REPO}",
        f"  Delete test orders first: {OUT_DELETE_TEST}",
        "",
        "Tomorrow import steps (Matrixify Basic):",
        "  1. Upgrade to Basic ($20/mo)",
        "  2. Import Orders-delete-test.csv to remove the 10 test orders",
        "  3. Import Orders.csv (511 orders, one file)",
        "  4. Spot-check 2-3 customers for Orders + Amount spent",
        "  5. Downgrade/uninstall Matrixify if no longer needed",
        "",
        "Payment totals are calculated from line items + shipping (fixes multi-item orders).",
        "",
    ]
    mismatches = stats.get("total_mismatches", [])
    if mismatches:
        report_lines.append(f"Woo vs calculated total mismatches: {len(mismatches)}")
        report_lines.extend(f"  {item}" for item in mismatches[:10])
        report_lines.append("")

    report_lines.extend(
        [
        "Top unmatched item names (imported as custom line items with historical prices):",
        ]
    )
    for name, count in sorted(unmatched.items(), key=lambda item: item[1], reverse=True)[:20]:
        report_lines.append(f"  {count:3}x  {name}")

    OUT_REPORT.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    OUT_REPORT_DL.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print("\n".join(report_lines[:20]))


if __name__ == "__main__":
    main()
