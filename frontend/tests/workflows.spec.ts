import { expect, test, type Page } from "@playwright/test"

/**
 * Authoring flow for code-node workflows.
 *
 * Running graphs is not covered: there is no run endpoint yet (that lands with
 * the execution engine). These tests cover creating a node, saving the graph,
 * and the two inspector behaviours that were reported broken: keeping focus in
 * the contract field inputs, and resizing the panel to the left.
 */

async function createWorkflowWithNode(page: Page): Promise<void> {
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
}

test("create a workflow, add a code node and save the graph", async ({ page }) => {
  await createWorkflowWithNode(page)

  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/Workflow is at version 2/)).toBeVisible({
    timeout: 15_000,
  })

  // The graph must come back from the database unchanged.
  await page.reload()
  await expect(page.getByText("Code 1")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("unsaved changes")).toBeHidden()
})

test("contract field name keeps focus while typing", async ({ page }) => {
  await createWorkflowWithNode(page)

  await page.getByRole("tab", { name: "input", exact: true }).click()
  await page.getByRole("button", { name: "Add field" }).click()

  const fieldName = page.getByPlaceholder("field name")
  await fieldName.click()
  await fieldName.fill("")
  // Typed character by character: a remount per keystroke would drop focus
  // after the first character and leave the value truncated.
  await page.keyboard.type("customer_email", { delay: 25 })

  await expect(fieldName).toHaveValue("customer_email")
  await expect(fieldName).toBeFocused()
})

test("node settings panel expands to the left", async ({ page }) => {
  await createWorkflowWithNode(page)

  const inspector = page.getByTestId("node-inspector")
  const before = (await inspector.boundingBox())?.width ?? 0
  expect(before).toBeGreaterThan(0)

  const handle = page.getByTestId("inspector-resize-handle")
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 220, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()

  const after = (await inspector.boundingBox())?.width ?? 0
  expect(after).toBeGreaterThan(before + 100)
})
