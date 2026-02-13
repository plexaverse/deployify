import os

def check_file_exists(filepath):
    if os.path.exists(filepath):
        print(f"✅ Found {filepath}")
        return True
    else:
        print(f"❌ Missing {filepath}")
        return False

def check_file_content(filepath, search_strings):
    if not os.path.exists(filepath):
        return False

    with open(filepath, 'r') as f:
        content = f.read()

    all_found = True
    for s in search_strings:
        if s in content:
            print(f"  ✅ Found '{s}' in {filepath}")
        else:
            print(f"  ❌ Missing '{s}' in {filepath}")
            all_found = False
    return all_found

def main():
    print("Verifying UI Improvements...")

    # 1. EmptyState component
    if check_file_exists("src/components/EmptyState.tsx"):
        check_file_content("src/components/EmptyState.tsx", [
            "export function EmptyState",
            "interface EmptyStateProps",
            "icon?: LucideIcon"
        ])

    # 2. Compare Page
    if check_file_exists("src/app/dashboard/[id]/deployments/compare/page.tsx"):
        check_file_content("src/app/dashboard/[id]/deployments/compare/page.tsx", [
            "export default function CompareDeploymentsPage",
            "baseId",
            "targetId",
            "Comparison Results",
            "Build Duration"
        ])

    # 3. Usage of EmptyState in Dashboard
    check_file_content("src/app/dashboard/page.tsx", [
        "import { EmptyState } from '@/components/EmptyState'",
        "<EmptyState"
    ])

    # 4. Usage of EmptyState in DomainsSection
    check_file_content("src/components/DomainsSection.tsx", [
        "import { EmptyState } from '@/components/EmptyState'",
        "<EmptyState"
    ])

    # 5. Usage of EmptyState in EnvVariablesSection
    check_file_content("src/components/EnvVariablesSection.tsx", [
        "import { EmptyState } from '@/components/EmptyState'",
        "<EmptyState"
    ])

    # 6. Usage of EmptyState in Project Detail
    check_file_content("src/app/dashboard/[id]/page.tsx", [
        "import { EmptyState } from '@/components/EmptyState'",
        "<EmptyState"
    ])

    # 7. Compare Link in Deployments Page
    check_file_content("src/app/dashboard/[id]/deployments/page.tsx", [
        "Compare Deployments",
        "ArrowLeftRight"
    ])

if __name__ == "__main__":
    main()
