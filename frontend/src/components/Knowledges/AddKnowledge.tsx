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

import { type ApiError, type KnowledgeCreate, KnowledgesService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface AddKnowledgeProps {
  isOpen: boolean
  onClose: () => void
}

const AddKnowledge = ({ isOpen, onClose }: AddKnowledgeProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<KnowledgeCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      files: []
    },
  })

  const mutation = useMutation({
    mutationFn: (data: KnowledgeCreate) =>
      KnowledgesService.createKnowledgeWithFiles({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Knowledge created successfully.", "success")
      reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] })
    },
  })

  const onSubmit: SubmitHandler<KnowledgeCreate> = (data) => {
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
          <ModalHeader>Add Knowledge</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isRequired isInvalid={!!errors.files}>
              <FormLabel htmlFor="files">Upload Files</FormLabel>
              <Input
                id="files"
                {...register("files", {
                  required: "Files is required.",
                })}
                placeholder="files"
                type="file"
                multiple
                accept="application/pdf"
              />
              {errors.files && (
                <FormErrorMessage>{errors.files.message}</FormErrorMessage>
              )}
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

export default AddKnowledge
