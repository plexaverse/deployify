#!/bin/bash

# Find files to process
FILES=$(grep -rnE 'text-(sm|base|lg|xl|2xl|3xl|4xl)' src/components/ src/app/ | cut -d: -f1 | sort | uniq)

for file in $FILES; do
    # Progressive shifting down of heading sizes

    # text-sm -> text-xs for headings and labels
    sed -i 's/text-sm font-semibold/text-xs font-semibold/g' "$file"
    sed -i 's/text-sm font-bold/text-xs font-bold/g' "$file"

    # text-sm -> text-xs for simple text where applicable (being careful here)
    sed -i 's/text-sm border-collapse/text-xs border-collapse/g' "$file"
    sed -i 's/text-sm space-y-4/text-xs space-y-4/g' "$file"
    sed -i 's/text-sm flex items-center/text-xs flex items-center/g' "$file"

done
