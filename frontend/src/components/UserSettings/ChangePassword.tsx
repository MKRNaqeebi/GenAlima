import { useMutation } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiLock, FiShield, FiKey } from "react-icons/fi"

import { type ApiError, type UpdatePassword, UsersService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { confirmPasswordRules, handleError, passwordRules } from "../../utils"

interface UpdatePasswordForm extends UpdatePassword {
  confirm_password: string
}

const ChangePassword = () => {
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordForm>({
    mode: "onBlur",
    criteriaMode: "all",
  })

  const mutation = useMutation({
    mutationFn: (data: UpdatePassword) =>
      UsersService.updatePasswordMe({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Password updated successfully.", "success")
      reset()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
  })

  const onSubmit: SubmitHandler<UpdatePasswordForm> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Current Password */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <FiKey className="w-4 h-4" />
            Current Password
          </div>
        </label>
        <input
          id="current_password"
          {...register("current_password", { required: "Current password is required" })}
          type="password"
          className={`w-full px-4 py-2.5 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
            errors.current_password ? "border-red-500" : "border-gray-600"
          }`}
          placeholder="Enter your current password"
        />
        {errors.current_password && (
          <p className="text-red-400 text-sm mt-1">
            {errors.current_password.message}
          </p>
        )}
      </div>

      {/* New Password */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <FiLock className="w-4 h-4" />
            New Password
          </div>
        </label>
        <input
          id="new_password"
          {...register("new_password", passwordRules())}
          type="password"
          className={`w-full px-4 py-2.5 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
            errors.new_password ? "border-red-500" : "border-gray-600"
          }`}
          placeholder="Enter your new password"
        />
        {errors.new_password && (
          <p className="text-red-400 text-sm mt-1">
            {errors.new_password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <FiShield className="w-4 h-4" />
            Confirm New Password
          </div>
        </label>
        <input
          id="confirm_password"
          {...register("confirm_password", confirmPasswordRules(getValues))}
          type="password"
          className={`w-full px-4 py-2.5 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
            errors.confirm_password ? "border-red-500" : "border-gray-600"
          }`}
          placeholder="Confirm your new password"
        />
        {errors.confirm_password && (
          <p className="text-red-400 text-sm mt-1">
            {errors.confirm_password.message}
          </p>
        )}
      </div>

      {/* Password Requirements Info */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Password Requirements:</h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• At least 8 characters long</li>
          <li>• Contains uppercase and lowercase letters</li>
          <li>• Contains at least one number</li>
          <li>• Contains at least one special character</li>
        </ul>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Updating...
            </>
          ) : (
            <>
              <FiLock className="w-4 h-4" />
              Update Password
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default ChangePassword