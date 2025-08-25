import { MdVisibility, MdVisibilityOff } from "react-icons/md"
import {
  Link as RouterLink,
  createFileRoute,
  redirect,
} from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { useState } from "react"

import Logo from "/assets/images/genalima-logo.png"
import type { Body_login_login_access_token as AccessToken } from "../client"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { emailPattern } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Login() {
  const [show, setShow] = useState(false)
  const { loginMutation, error, resetError } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccessToken>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit: SubmitHandler<AccessToken> = async (data) => {
    if (loginMutation.isPending) return

    resetError()

    try {
      await loginMutation.mutateAsync(data)
    } catch {
      // error is handled by useAuth hook
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-sm w-full p-0">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="space-y-6">
            <img
              src={Logo}
              alt="GenAlima logo"
              className="h-auto max-w-xs mx-auto"
            />
            <div className="space-y-2">
              <input
                id="username"
                {...register("username", {
                  required: "Username is required",
                  pattern: emailPattern,
                })}
                placeholder="Email"
                type="email"
                required
                disabled={loginMutation.isPending}
                className={`w-full px-4 py-3 text-lg rounded-lg border bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  (errors.username || error) ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {errors.username && (
                <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="relative">
                <input
                  {...register("password", {
                    required: "Password is required",
                  })}
                  type={show ? "text" : "password"}
                  placeholder="Password"
                  required
                  disabled={loginMutation.isPending}
                  className={`w-full px-4 py-3 pr-12 text-lg rounded-lg border bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                    error ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? (
                    <MdVisibilityOff className="h-5 w-5" />
                  ) : (
                    <MdVisibility className="h-5 w-5" />
                  )}
                </button>
              </div>
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>
            <RouterLink 
              to="/recover-password" 
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 text-sm self-start transition-colors"
            >
              Forgot password?
            </RouterLink>
            <button 
              type="submit" 
              disabled={loginMutation.isPending}
              className="w-full py-3 px-4 text-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </button>
            <p className="text-gray-900 dark:text-gray-100 text-center">
              Don't have an account?{" "}
              <RouterLink 
                to="/signup" 
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
              >
                Sign up
              </RouterLink>
            </p>
            <p className="text-gray-600 dark:text-gray-400 text-center text-sm mt-2">
              <RouterLink 
                to="/home" 
                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                ← Back to homepage
              </RouterLink>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
