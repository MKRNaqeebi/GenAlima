import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Textarea,
  Checkbox,
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

import { type ApiError, type TemplateCreate, TemplatesService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface AddTemplateProps {
  isOpen: boolean
  onClose: () => void
}

const AddTemplate = ({ isOpen, onClose }: AddTemplateProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: TemplateCreate) =>
      TemplatesService.createTemplate({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Template created successfully.", "success")
      reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
  })

  const onSubmit: SubmitHandler<TemplateCreate> = (data) => {
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
          <ModalHeader>Add Template</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isRequired isInvalid={!!errors.title}>
              <FormLabel htmlFor="title">Title</FormLabel>
              <Input
                id="title"
                {...register("title", {
                  required: "Title is required.",
                })}
                placeholder="Title"
                type="text"
              />
              {errors.title && (
                <FormErrorMessage>{errors.title.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="description">Description</FormLabel>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Description"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="instructions">Instructions</FormLabel>
              <Textarea
                id="instructions"
                {...register("instructions")}
                placeholder="Instructions"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="template">Template</FormLabel>
              <Textarea
                id="template"
                {...register("template")}
                placeholder="Template"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="placeholder">Placeholder</FormLabel>
              <Input
                id="placeholder"
                {...register("placeholder")}
                placeholder="Placeholder"
                type="text"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="model">Model</FormLabel>
              <Input
                id="model"
                {...register("model")}
                placeholder="Model"
                type="text"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="connector">Connector</FormLabel>
              <Input
                id="connector"
                {...register("connector")}
                placeholder="Connector"
                type="text"
              />
            </FormControl>
            <FormControl mt={4}>
              <Checkbox
                id="active"
                {...register("active")}
                type="checkbox"
              />
              <FormLabel htmlFor="active">Active</FormLabel>
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

export default AddTemplate
