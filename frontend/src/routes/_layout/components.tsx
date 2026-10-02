import { createFileRoute } from "@tanstack/react-router"

import ComponentsList from "../../components/Workflows/ComponentsList"

export const Route = createFileRoute("/_layout/components")({
  component: Components,
})

function Components() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 dark:bg-app-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-8 pt-8">
        <div className="mb-2 flex-shrink-0 space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Components
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Versioned workflows your organization has published. Drag them from
            the editor&apos;s palette onto any canvas.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <ComponentsList />
        </div>
      </div>
    </div>
  )
}
