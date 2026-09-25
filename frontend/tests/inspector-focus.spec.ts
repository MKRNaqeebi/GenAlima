import { expect, test, type Page } from "@playwright/test"

/**
 * Focus regressions in the node inspector.
 *
 * Every editable input is checked individually: a controlled input that is
 * remounted on change (for example because its React key changes per keystroke)
 * swallows focus after the first character, which looks like "the field stops
 * working when I type".
 */

async function openNodeInspector(page: Page): Promise<void> {
  await page.goto("/workflows")
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible()
  await page.getByRole("button", { name: "New workflow" }).click()
  await page.getByPlaceholder("Daily report").fill(`focus ${Date.now()}`)
  await page.getByRole("button", { name: "Create" }).click()
  await expect(page).toHaveURL(/\/workflow\//)
  await page.getByRole("button", { name: "Add code node" }).click()
  // addNode selects the new node, so the inspector is already showing it.
  await expect(page.getByTestId("node-inspector")).toBeVisible()
}

test("contract field name keeps focus while typing", async ({ page }) => {
  await openNodeInspector(page)
  await page.getByRole("tab", { name: "input", exact: true }).click()
  await page.getByRole("button", { name: "Add field" }).click()

  const input = page.getByPlaceholder("field name")
  await input.click()
  await input.fill("")
  await page.keyboard.type("customer_email", { delay: 20 })

  await expect(input).toHaveValue("customer_email")
  await expect(input).toBeFocused()
})

test("contract default value keeps focus while typing", async ({ page }) => {
  await openNodeInspector(page)
  await page.getByRole("tab", { name: "output", exact: true }).click()
  await page.getByRole("button", { name: "Add field" }).click()
  // A default only exists for optional fields.
  await page.getByLabel("required").uncheck()

  const input = page.getByPlaceholder("JSON")
  await input.click()
  await input.fill("")
  await page.keyboard.type("12345", { delay: 20 })

  await expect(input).toHaveValue("12345")
  await expect(input).toBeFocused()
})

test("node name keeps focus while typing", async ({ page }) => {
  await openNodeInspector(page)
  const input = page.getByTestId("node-inspector").locator("input").first()
  await input.click()
  await input.fill("")
  await page.keyboard.type("Transform", { delay: 20 })
  await expect(input).toHaveValue("Transform")
  await expect(input).toBeFocused()
})

test("workflow name keeps focus while typing", async ({ page }) => {
  await openNodeInspector(page)
  const input = page.locator("header input").first()
  await input.click()
  await input.fill("")
  await page.keyboard.type("My flow", { delay: 20 })
  await expect(input).toHaveValue("My flow")
  await expect(input).toBeFocused()
})

test("code editor keeps focus while typing", async ({ page }) => {
  await openNodeInspector(page)
  const editor = page.locator(".cm-content")
  await editor.click()
  await page.keyboard.type("result = items", { delay: 20 })
  await expect(editor).toContainText("result = items")
  await expect(editor).toBeFocused()
})

test("a renamed field survives switching tabs", async ({ page }) => {
  await openNodeInspector(page)
  await page.getByRole("tab", { name: "input", exact: true }).click()
  await page.getByRole("button", { name: "Add field" }).click()

  const input = page.getByPlaceholder("field name")
  await input.click()
  await input.fill("")
  await page.keyboard.type("order_id", { delay: 20 })
  await expect(input).toBeFocused()

  await page.getByRole("tab", { name: "code", exact: true }).click()
  await page.getByRole("tab", { name: "input", exact: true }).click()
  await expect(page.getByPlaceholder("field name")).toHaveValue("order_id")
})
