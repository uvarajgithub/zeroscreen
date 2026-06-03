#!/usr/bin/env python3
"""
Fix DRISHTI entry price to use actual FUTURES fill price instead of INDEX candle close.
This prevents phantom P&L due to premiums between INDEX and FUTURES prices.
"""

with open('/home/ubuntu/trading-bot/src/index.ts', 'r') as f:
    lines = f.readlines()

# Find the DRISHTI entry section and insert the fix
# We're looking for the line with: if (!order || order.status !== "COMPLETE"...
# around line 1617

insert_after_line = None
for i, line in enumerate(lines):
    # Find the if statement checking order status in DRISHTI section
    if i > 1600 and i < 1630 and 'if (!order || order.status' in line:
        insert_after_line = i
        break

if insert_after_line is not None:
    # Find the closing brace of this if block
    indent_level = len(lines[insert_after_line]) - len(lines[insert_after_line].lstrip())
    brace_count = 1  # We're inside the if, so start with 1
    
    for i in range(insert_after_line + 1, len(lines)):
        line = lines[i]
        brace_count += line.count('{') - line.count('}')
        
        if brace_count == 0:
            # Found the closing brace of the if statement
            insert_location = i + 1
            
            # Create the fix code with proper indentation
            fix_lines = [
                "\n",
                "    // ╔════ FIX: Update entry price to actual FUTURES fill price ════╗\n",
                "    const actualFillPrice = (order as any).average_price ?? bc.close;\n",
                "    entryPrice = actualFillPrice;              // Use FUTURES price, not INDEX\n",
                "    DrishtiState.entry = actualFillPrice;      // Update trail calculations\n",
                "    log(\"ENTRY_PRICE_UPDATE\", { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1) });\n",
                "    // ╚═════════════════════════════════════════════════════════════╝\n",
            ]
            
            # Insert the fix lines
            for j, fix_line in enumerate(fix_lines):
                lines.insert(insert_location + j, fix_line)
            
            # Write back to file
            with open('/home/ubuntu/trading-bot/src/index.ts', 'w') as f:
                f.writelines(lines)
            
            print("✓ Entry price fix successfully applied!")
            print(f"  - Inserted at line {insert_location}")
            print(f"  - Captured actual fill price from order.average_price")
            print(f"  - Updated both entryPrice and DrishtiState.entry")
            break
    else:
        print("✗ Could not find closing brace of order check")
else:
    print("✗ Could not find order status check in DRISHTI section")
