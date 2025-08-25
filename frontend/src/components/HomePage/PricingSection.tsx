import { Link } from "@tanstack/react-router"
import { FiCheck } from "react-icons/fi"

const PricingSection = () => {
  const pricingPlans = [
    {
      name: "Free",
      price: "$0",
      period: "/month",
      description: "Perfect for trying out GenAlima",
      features: [
        "Up to 100 questions per month",
        "Connect 2 data sources",
        "Basic AI responses",
        "Email support",
        "7-day data retention"
      ],
      cta: "Start Free",
      highlighted: false
    },
    {
      name: "Professional",
      price: "$20",
      period: "/month",
      description: "Ideal for small businesses",
      features: [
        "Unlimited questions",
        "Connect up to 10 data sources",
        "Advanced AI with context memory",
        "Priority email support",
        "30-day data retention",
        "Custom integrations",
        "Team collaboration (up to 5 users)"
      ],
      cta: "Start Free Trial",
      highlighted: true
    },
    {
      name: "Business",
      price: "$100",
      period: "/month",
      description: "For growing companies",
      features: [
        "Everything in Professional",
        "Unlimited data sources",
        "Advanced analytics & insights",
        "24/7 priority support",
        "Unlimited data retention",
        "API access",
        "Team collaboration (up to 25 users)",
        "Custom AI training",
        "SSO authentication"
      ],
      cta: "Start Free Trial",
      highlighted: false
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large organizations",
      features: [
        "Everything in Business",
        "Unlimited users",
        "Dedicated account manager",
        "Custom SLA",
        "On-premise deployment option",
        "Advanced security features",
        "Custom integrations",
        "White-label options",
        "Training & onboarding"
      ],
      cta: "Contact Sales",
      highlighted: false
    }
  ]

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Choose the plan that fits your business needs
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-lg border ${
                plan.highlighted
                  ? "border-emerald-500 ring-2 ring-emerald-500"
                  : "border-gray-200 dark:border-gray-700"
              } p-8 flex flex-col h-full`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-emerald-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {plan.description}
                </p>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 ml-1">
                    {plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <FiCheck className="w-5 h-5 text-emerald-500 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {plan.name === "Enterprise" ? (
                  <a
                    href="mailto:support@genalima.com"
                    className={`block w-full text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                      plan.highlighted
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    to="/signup"
                    className={`block w-full text-center py-3 px-4 rounded-lg font-semibold transition-colors ${
                      plan.highlighted
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            All plans include 14-day free trial. No credit card required.
          </p>
        </div>
      </div>
    </section>
  )
}

export default PricingSection