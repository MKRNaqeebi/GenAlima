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

import { type ApiError, type MessageCreate, MessagesService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"
import useAuth from "../../hooks/useAuth"

interface AddMessageProps {
  isOpen: boolean
  onClose: () => void
}

const AddMessage = ({ isOpen, onClose }: AddMessageProps) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MessageCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      content: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: MessageCreate) =>
      MessagesService.createMessage({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Message created successfully.", "success")
      reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] })
    },
  })

  const onSubmit: SubmitHandler<MessageCreate> = (data) => {
    if (user){
      data.owner_id=user.id
    }
    else{
      data.owner_id=''
    }
    mutation.mutate(data)
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
          <ModalHeader>Add Message</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isRequired isInvalid={!!errors.chat_id}>
              <FormLabel htmlFor="chat_id">Chat ID</FormLabel>
              <Input
                id="chat_id"
                {...register("chat_id", {
                  required: "Chat ID is required.",
                })}
                placeholder="Chat ID"
                type="text"
              />
              {errors.chat_id && (
                <FormErrorMessage>{errors.chat_id.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl isRequired isInvalid={!!errors.content}>
              <FormLabel htmlFor="content">Content</FormLabel>
              <Input
                id="content"
                {...register("content", {
                  required: "Content is required.",
                })}
                placeholder="Content"
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
                  required: "Role is required.",
                })}
                placeholder="Role"
                type="text"
              />
            </FormControl>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Save
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default AddMessage
