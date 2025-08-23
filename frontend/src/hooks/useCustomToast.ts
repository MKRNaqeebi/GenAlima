import { useToast } from "../components/Common/Toast"
import { useCallback } from "react"

const useCustomToast = () => {
  const { showToast } = useToast()

  const customShowToast = useCallback(
    (title: string, description: string, status: "success" | "error") => {
      showToast(title, description, status)
    },
    [showToast],
  )

  return customShowToast
}

export default useCustomToast
