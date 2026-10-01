import { type Page, expect, test } from "@playwright/test"

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

test("create a workflow, add a code node and save the graph", async ({
  page,
}) => {
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

test("connect two code nodes by dragging between handles", async ({ page }) => {
  await createWorkflowWithNode(page)
  // A second node, placed to the right of the first.
  await page.getByRole("button", { name: "Add code node" }).click()
  await expect(page.getByText("Code 2")).toBeVisible()

  const edges = page.locator(".react-flow__edge")
  await expect(edges).toHaveCount(0)

  const source = page
    .locator(".react-flow__node", { hasText: "Code 1" })
    .locator(".react-flow__handle-right")
  const target = page
    .locator(".react-flow__node", { hasText: "Code 2" })
    .locator(".react-flow__handle-left")

  const from = await source.boundingBox()
  const to = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  if (!from || !to) return

  // Drag from the source handle (right side of Code 1) to the target handle
  // (left side of Code 2).
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 20,
  })
  await page.mouse.up()

  await expect(edges).toHaveCount(1)

  // The connection must survive a save and a reload.
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/Workflow is at version 2/)).toBeVisible({
    timeout: 15_000,
  })
  await page.reload()
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, {
    timeout: 15_000,
  })
})

/** Add one field to a node's input or output contract and rename it. */
async function declareField(
  page: Page,
  nodeName: string,
  side: "input" | "output",
  field: string,
): Promise<void> {
  await page.locator(".react-flow__node", { hasText: nodeName }).click()
  await page.getByRole("tab", { name: side, exact: true }).click()
  await page.getByRole("button", { name: "Add field" }).click()
  const name = page.getByPlaceholder("field name")
  await name.fill(field)
  await name.press("Enter")
  await expect(name).toHaveValue(field)
}

/**
 * Select the only edge on the canvas.
 *
 * A dispatched event rather than a real click: two equally-sized nodes produce a
 * perfectly horizontal edge, whose SVG path has a zero-height bounding box, and
 * Playwright treats that as invisible.
 */
async function selectOnlyEdge(page: Page): Promise<void> {
  await page
    .locator(".react-flow__edge-interaction")
    .first()
    .dispatchEvent("click")
  await expect(page.getByTestId("edge-inspector")).toBeVisible()
}

test("maps which output field feeds which input field", async ({ page }) => {
  await createWorkflowWithNode(page)
  await page.getByRole("button", { name: "Add code node" }).click()
  await expect(page.getByText("Code 2")).toBeVisible()

  await declareField(page, "Code 1", "output", "a")
  await declareField(page, "Code 2", "input", "b")

  const source = page
    .locator(".react-flow__node", { hasText: "Code 1" })
    .locator(".react-flow__handle-right")
  const target = page
    .locator(".react-flow__node", { hasText: "Code 2" })
    .locator(".react-flow__handle-left")
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  if (!from || !to) return

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 20,
  })
  await page.mouse.up()

  await expect(page.locator(".react-flow__edge")).toHaveCount(1)

  // Strict: the names differ, so auto-map maps nothing and 'b' is uncovered.
  await expect(
    page.getByText(/required input field 'b' is not mapped/),
  ).toBeVisible()

  await selectOnlyEdge(page)
  await page.getByLabel("source field for b").selectOption("a")

  // Covering the input clears the live node fault.
  await expect(
    page.getByText(/required input field 'b' is not mapped/),
  ).toBeHidden()

  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/Workflow is at version 2/)).toBeVisible({
    timeout: 15_000,
  })

  // The mapping must survive a save and a reload.
  await page.reload()
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, {
    timeout: 15_000,
  })
  await selectOnlyEdge(page)
  await expect(page.getByLabel("source field for b")).toHaveValue("a")
})
