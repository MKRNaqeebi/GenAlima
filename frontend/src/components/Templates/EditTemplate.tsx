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

import {
  type ApiError,
  type TemplatePublic,
  type TemplateUpdate,
  TemplatesService,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface EditTemplateProps {
  template: TemplatePublic
  isOpen: boolean
  onClose: () => void
}

const EditTemplate = ({ template, isOpen, onClose }: EditTemplateProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors, isDirty },
  } = useForm<TemplateUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: template,
  })

  const mutation = useMutation({
    mutationFn: (data: TemplateUpdate) =>
      TemplatesService.updateTemplate({ id: template.id, requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Template updated successfully.", "success")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
  })

  const onSubmit: SubmitHandler<TemplateUpdate> = async (data) => {
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
          <ModalHeader>Edit Template</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isInvalid={!!errors.title}>
              <FormLabel htmlFor="title">Title</FormLabel>
              <Input
                id="title"
                {...register("title", {
                  required: "Title is required",
                })}
                type="text"
              />
              {errors.title && (
                <FormErrorMessage>{errors.title.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="description">Description</FormLabel>
              <Input
                id="description"
                {...register("description")}
                placeholder="Description"
                type="text"
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

export default EditTemplate
