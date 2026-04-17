#!/bin/bash
find src -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/text-\[10px\]/text-\[9px\]/g'
