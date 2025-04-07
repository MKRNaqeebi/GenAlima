import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  type ApiError,
  type MessagePublic,
  type MessageUpdate,
  MessagesService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface EditMessageProps {
  message: MessagePublic
  isOpen: boolean
  onClose: () => void
}

const EditMessage = ({ message, isOpen, onClose }: EditMessageProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors, isDirty },
  } = useForm<MessageUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: message,
  })

  const mutation = useMutation({
    mutationFn: (data: MessageUpdate) =>
      MessagesService.updateMessage({ id: message.id, requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Message updated successfully.", "success")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] })
    },
  })

  const onSubmit: SubmitHandler<MessageUpdate> = async (data) => {
    mutation.mutate(data)
  }

  const onCancel = () => {
    reset()
    onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size={{ base: "sm", md: "md" }}
        isCentered
      >
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Edit Message</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isInvalid={!!errors.chat_id}>
              <FormLabel htmlFor="chat_id">Chat ID</FormLabel>
              <Input
                id="chat_id"
                {...register("chat_id", {
                  required: "Chat ID is required",
                })}
                type="text"
                isDisabled
              />
              {errors.chat_id && (
                <FormErrorMessage>{errors.chat_id.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl isInvalid={!!errors.content}>
              <FormLabel htmlFor="content">Content</FormLabel>
              <Input
                id="content"
                {...register("content", {
                  required: "Content is required",
                })}
                type="text"
              />
              {errors.content && (
                <FormErrorMessage>{errors.content.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="role">Role</FormLabel>
              <Input
                id="role"
                {...register("role", {
                  required: "Role is required",
                })}
                type="text"
              />
            </FormControl>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              variant="primary"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={!isDirty}
            >
              Save
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default EditMessage
