import {
  Button,
  Container,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Image,
  Input,
  Link,
  Text,
  useColorModeValue,
  Box,
  VStack,
} from "@chakra-ui/react"
import {
  Link as RouterLink,
  createFileRoute,
  redirect,
} from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"

import Logo from "/assets/images/genalima-logo.png"
import type { UserRegister } from "../client"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { confirmPasswordRules, emailPattern, passwordRules } from "../utils"

export const Route = createFileRoute("/signup")({
  component: SignUp,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

interface UserRegisterForm extends UserRegister {
  confirm_password: string
}

function SignUp() {
  const { signUpMutation } = useAuth()
  
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#1a1a1a" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const inputBg = isDark ? "#2b2b2b" : "#f7f7f7"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"
  const cardBg = isDark ? "#2b2b2b" : "#ffffff"
  const cardShadow = isDark ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.1)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<UserRegisterForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
    },
  })

  const onSubmit: SubmitHandler<UserRegisterForm> = (data) => {
    signUpMutation.mutate(data)
  }

  return (
    <Box minH="100vh" bg={bgColor} display="flex" alignItems="center" justifyContent="center" px={4}>
      <Container maxW="sm" p={0}>
        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          bg={cardBg}
          p={8}
          borderRadius="xl"
          boxShadow={cardShadow}
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={5}>
            <Image
              src={Logo}
              alt="GenAlima logo"
              height="auto"
              maxW="2xs"
              alignSelf="center"
            />
            <FormControl id="full_name" isInvalid={!!errors.full_name}>
              <FormLabel htmlFor="full_name" srOnly>
                Full Name
              </FormLabel>
              <Input
                id="full_name"
                minLength={3}
                {...register("full_name", { required: "Full Name is required" })}
                placeholder="Full Name"
                type="text"
                size="lg"
                bg={inputBg}
                borderColor={borderColor}
                color={textColor}
                _placeholder={{ color: placeholderColor }}
                _hover={{ borderColor: "#10a37f" }}
                _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                isDisabled={signUpMutation.isPending}
              />
              {errors.full_name && (
                <FormErrorMessage>{errors.full_name.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl id="email" isInvalid={!!errors.email}>
              <FormLabel htmlFor="email" srOnly>
                Email
              </FormLabel>
              <Input
                id="email"
                {...register("email", {
                  required: "Email is required",
                  pattern: emailPattern,
                })}
                placeholder="Email"
                type="email"
                size="lg"
                bg={inputBg}
                borderColor={borderColor}
                color={textColor}
                _placeholder={{ color: placeholderColor }}
                _hover={{ borderColor: "#10a37f" }}
                _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                isDisabled={signUpMutation.isPending}
              />
              {errors.email && (
                <FormErrorMessage>{errors.email.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl id="password" isInvalid={!!errors.password}>
              <FormLabel htmlFor="password" srOnly>
                Password
              </FormLabel>
              <Input
                id="password"
                {...register("password", passwordRules())}
                placeholder="Password"
                type="password"
                size="lg"
                bg={inputBg}
                borderColor={borderColor}
                color={textColor}
                _placeholder={{ color: placeholderColor }}
                _hover={{ borderColor: "#10a37f" }}
                _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                isDisabled={signUpMutation.isPending}
              />
              {errors.password && (
                <FormErrorMessage>{errors.password.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl
              id="confirm_password"
              isInvalid={!!errors.confirm_password}
            >
              <FormLabel htmlFor="confirm_password" srOnly>
                Confirm Password
              </FormLabel>
              <Input
                id="confirm_password"
                {...register("confirm_password", confirmPasswordRules(getValues))}
                placeholder="Repeat Password"
                type="password"
                size="lg"
                bg={inputBg}
                borderColor={borderColor}
                color={textColor}
                _placeholder={{ color: placeholderColor }}
                _hover={{ borderColor: "#10a37f" }}
                _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                isDisabled={signUpMutation.isPending}
              />
              {errors.confirm_password && (
                <FormErrorMessage>
                  {errors.confirm_password.message}
                </FormErrorMessage>
              )}
            </FormControl>
            <Button 
              type="submit" 
              size="lg"
              width="full"
              bg="#10a37f"
              color="white"
              _hover={{ bg: "#0d8265" }}
              _active={{ bg: "#0a6b4f" }}
              isLoading={signUpMutation.isPending}
              loadingText="Creating account..."
              isDisabled={signUpMutation.isPending}
            >
              Create Account
            </Button>
            <Text color={textColor} textAlign="center">
              Already have an account?{" "}
              <Link 
                as={RouterLink} 
                to="/login" 
                color="#10a37f"
                fontWeight="medium"
                _hover={{ color: "#0d8265" }}
              >
                Sign in
              </Link>
            </Text>
          </VStack>
        </Box>
      </Container>
    </Box>
  )
}

export default SignUp
