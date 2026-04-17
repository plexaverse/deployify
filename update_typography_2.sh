#!/bin/bash

# Change the metadata tags from text-[10px] to text-[9px] to be progressive down.
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-\[10px\] font-bold uppercase tracking-wider/text-\[9px\] font-bold uppercase tracking-wider/g'
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-\[10px\] font-bold uppercase tracking-wider/text-\[9px\] font-bold uppercase tracking-wider/g'
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/placeholder:text-\[10px\] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider/placeholder:text-\[9px\] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider/g'
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-\[10px\] md:text-\[11px\]/text-\[10px\] md:text-\[11px\]/g'
