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
  type KnowledgePublic,
  type KnowledgeUpdate,
  KnowledgesService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface EditKnowledgeProps {
  knowledge: KnowledgePublic
  isOpen: boolean
  onClose: () => void
}

const EditKnowledge = ({ knowledge, isOpen, onClose }: EditKnowledgeProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors, isDirty },
  } = useForm<KnowledgeUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: knowledge,
  })

  const mutation = useMutation({
    mutationFn: (data: KnowledgeUpdate) =>
      KnowledgesService.updateKnowledge({ id: knowledge.id, requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Knowledge updated successfully.", "success")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledges"] })
    },
  })

  const onSubmit: SubmitHandler<KnowledgeUpdate> = async (data) => {
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
          <ModalHeader>Edit Knowledge</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isInvalid={!!errors.filename}>
              <FormLabel htmlFor="filename">Filename</FormLabel>
              <Input
                id="filename"
                {...register("filename", {
                  required: "Filename is required",
                })}
                type="text"
              />
              {errors.filename && (
                <FormErrorMessage>{errors.filename.message}</FormErrorMessage>
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
              <FormLabel htmlFor="pagepage_number">Page Number</FormLabel>
              <Input
                id="page_number"
                {...register("page_number", {
                  required: "Page Number is required",
                })}
                type="number"
                min={1}
                step={1}
                defaultValue={knowledge.page_number}
              />
              {errors.page_number && (
                <FormErrorMessage>{errors.page_number.message}</FormErrorMessage>
              )}
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

export default EditKnowledge
