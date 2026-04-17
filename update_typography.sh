#!/bin/bash
# First replace all text-[11px] md:text-xs -> text-[10px] md:text-[11px]
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-\[11px\] md:text-xs/text-\[10px\] md:text-\[11px\]/g'

# Replace all remaining text-xs -> text-[11px]
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-xs/text-\[11px\]/g'
