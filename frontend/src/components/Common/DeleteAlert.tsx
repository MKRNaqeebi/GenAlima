import { useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import React from "react"
import { useForm } from "react-hook-form"

import {
  ItemsService, UsersService, MessagesService, ChatsService, ConnectorsService, TemplatesService, KnowledgeFilesService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"

interface DeleteProps {
  type: string
  id: string
  isOpen: boolean
  onClose: () => void
}

const Delete = ({ type, id, isOpen, onClose }: DeleteProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const cancelRef = React.useRef<HTMLButtonElement | null>(null)
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm()

  const deleteEntity = async (id: string) => {
    if (type === "Item") {
      await ItemsService.deleteItem({ id: id })
    } else if (type === "Connector") {
      await ConnectorsService.deleteConnector({ id: id })
    } else if (type === "Template") {
      await TemplatesService.deleteTemplate({ id: id })
    } else if (type === "Message") {
      await MessagesService.deleteMessage({ id: id })
    } else if (type === "Chat") {
      await ChatsService.deleteChat({ id: id })
    } else if (type === "User") {
      await UsersService.deleteUser({ userId: id })
    } else if (type === "Knowledge") {
      await KnowledgeFilesService.deleteKnowledgeFile({ id: id })
    } else {
      throw new Error(`Unexpected type: ${type}`)
    }
  }

  const mutation = useMutation({
    mutationFn: deleteEntity,
    onSuccess: () => {
      showToast(
        "Success",
        `The ${type.toLowerCase()} was deleted successfully.`,
        "success",
      )
      onClose()
    },
    onError: () => {
      showToast(
        "An error occurred.",
        `An error occurred while deleting the ${type.toLowerCase()}.`,
        "error",
      )
    },
    onSettled: () => {
      const queryKey = 
        type === "Item" ? ["items"] :
        type === "User" ? ["users"] :
        type === "Knowledge" ? ["knowledgeFiles"] :
        type === "Connector" ? ["connectors"] :
        type === "Template" ? ["templates"] :
        type === "Chat" ? ["chats"] :
        type === "Message" ? ["messages"] :
        ["items"]
      
      queryClient.invalidateQueries({
        queryKey: queryKey,
      })
    },
  })

  const onSubmit = async () => {
    mutation.mutate(id)
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg max-w-sm md:max-w-md w-full">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete {type}</h2>
            </div>

            <div className="px-6 py-4">
              {type === "User" && (
                <span>
                  All items associated with this user will also be{" "}
                  <strong>permantly deleted. </strong>
                </span>
              )}
              <p className="text-gray-600 dark:text-gray-400">Are you sure? You will not be able to undo this action.</p>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex gap-3 justify-end rounded-b-lg">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {isSubmitting ? "Deleting..." : "Delete"}
              </button>
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default Delete
