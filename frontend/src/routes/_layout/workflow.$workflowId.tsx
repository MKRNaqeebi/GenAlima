import { createFileRoute, useNavigate } from "@tanstack/react-router"

import WorkflowEditor from "../../components/Workflows/WorkflowEditor"

export const Route = createFileRoute("/_layout/workflow/$workflowId")({
  component: WorkflowEditorPage,
})

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams()
  const navigate = useNavigate()

  if (!workflowId) {
    navigate({ to: "/workflows" })
    return null
  }

  return <WorkflowEditor workflowId={workflowId} />
}
