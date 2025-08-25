import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"

import { type ApiError, LoginService } from "../client"
import { isLoggedIn } from "../hooks/useAuth"
import useCustomToast from "../hooks/useCustomToast"
import { emailPattern, handleError } from "../utils"

interface FormData {
  email: string
}

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function RecoverPassword() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()
  const showToast = useCustomToast()

  const recoverPassword = async (data: FormData) => {
    await LoginService.recoverPassword({
      email: data.email,
    })
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      showToast(
        "Email sent.",
        "We sent an email with a link to get back into your account.",
        "success",
      )
      reset()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
  })

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-sm w-full p-0">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 space-y-6"
        >
          <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 text-center mb-2">
            Password Recovery
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400">
            A password recovery email will be sent to the registered account.
          </p>
          <div className="space-y-2">
            <input
              id="email"
              {...register("email", {
                required: "Email is required",
                pattern: emailPattern,
              })}
              placeholder="Email"
              type="email"
              disabled={isSubmitting}
              className={`w-full px-4 py-3 rounded-lg border bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                errors.email ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Sending..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  )
}
