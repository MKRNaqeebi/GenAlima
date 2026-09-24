import { expect, test } from "@playwright/test"

/**
 * Authoring flow for code-node workflows: create a workflow, add a code node,
 * save the graph, and confirm it survives a reload.
 *
 * Only authoring is covered here — running graphs arrives with the execution
 * engine, and there is no run endpoint yet.
 */
test("create a workflow, add a code node and save the graph", async ({ page }) => {
  const name = `E2E workflow ${Date.now()}`

  await page.goto("/workflows")
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible()

  await page.getByRole("button", { name: "New workflow" }).click()
  await page.getByPlaceholder("Daily report").fill(name)
  await page.getByRole("button", { name: "Create" }).click()

  // Creating navigates straight into the editor.
  await expect(page).toHaveURL(/\/workflow\//)

  await page.getByRole("button", { name: "Add code node" }).click()
  await expect(page.getByText("Code 1")).toBeVisible()

  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/Workflow is at version 2/)).toBeVisible({
    timeout: 15_000,
  })

  // The graph must come back from the database unchanged.
  await page.reload()
  await expect(page.getByText("Code 1")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("unsaved changes")).toBeHidden()
})
