from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()

    # Define mock handlers with correct structure
    def handle_project_details(route):
        route.fulfill(json={
            "project": {
                "id": "p1",
                "name": "Test Project",
                "repoFullName": "user/test-repo",
                "productionUrl": "test.com",
                "updatedAt": "2023-01-01T00:00:00Z",
                "defaultBranch": "main"
            }
        })

    def handle_env_vars_grouped(route):
        route.fulfill(json={
            "envVariables": [
                {"id": "1", "key": "API_KEY", "value": "xxx", "group": "GENERAL", "environment": "production", "target": "runtime"},
                {"id": "2", "key": "DB_HOST", "value": "localhost", "group": "DATABASE", "environment": "production", "target": "runtime"}
            ]
        })

    def handle_env_vars_empty(route):
        route.fulfill(json={"envVariables": []})

    def handle_projects_empty(route):
        route.fulfill(json={"projects": []})

    def handle_deployments(route):
        route.fulfill(json={"deployments": []})

    def handle_domains(route):
        route.fulfill(json={"domains": []})

    # 1. Verify Env Var Grouping
    print("Verifying Env Var Grouping...")

    # Mock all necessary endpoints for the settings page
    page.route("**/api/projects/p1", handle_project_details)
    page.route("**/api/projects/p1/env", handle_env_vars_grouped)
    page.route("**/api/projects/p1/deployments", handle_deployments)
    page.route("**/api/projects/p1/domains", handle_domains)

    # We might need to mock /api/user if the layout fetches user info, but usually it's handled by session or context

    page.goto("http://localhost:3000/dashboard/p1/settings")

    try:
        page.wait_for_selector("text=GENERAL", timeout=10000)
        page.wait_for_selector("text=DATABASE", timeout=10000)
        print("Found group headers.")
    except Exception as e:
        print(f"Error finding group headers: {e}")
        # Take a screenshot to debug
        page.screenshot(path="verification/debug_grouping_fail.png")

    page.screenshot(path="verification/env_grouping.png", full_page=True)


    # 2. Verify Empty Env Vars
    print("Verifying Empty Env Vars...")
    page.unroute("**/api/projects/p1/env")
    page.route("**/api/projects/p1/env", handle_env_vars_empty)
    page.reload()

    try:
        page.wait_for_selector("text=No environment variables yet", timeout=10000)
        print("Found empty env var state.")
    except Exception as e:
        print(f"Error finding empty env var state: {e}")
        page.screenshot(path="verification/debug_env_empty_fail.png")

    page.screenshot(path="verification/env_empty.png", full_page=True)


    # 3. Verify Empty Projects List
    print("Verifying Empty Projects List...")
    page.unroute("**/api/projects/p1") # Clear previous project mocks
    # Mock empty projects list
    page.route("**/api/projects", handle_projects_empty)

    page.goto("http://localhost:3000/dashboard")

    try:
        page.wait_for_selector("text=No Projects Yet", timeout=10000)
        print("Found empty projects state.")
    except Exception as e:
        print(f"Error finding empty projects state: {e}")
        page.screenshot(path="verification/debug_projects_empty_fail.png")

    page.screenshot(path="verification/projects_empty.png", full_page=True)

    browser.close()

with sync_playwright() as p:
    run(p)
