"""
Gen Model
"""
# Local application imports
from gen_model.gen_openai import gen_openai_model


def call_gen_model(
    model: str, messages: list[dict[str, str]]
) -> dict[str, str]:
    """
    Call the OpenAI model with the given messages.
    
    Args:
        model (str): The OpenAI model to use.
        messages (list[dict[str, str]]): The messages to send to the model.
    
    Returns:
        dict[str, str]: The response from the OpenAI API.
    """
    if model in ["gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-5-mini"]:
        return gen_openai_model.call_openai_model(model=model, messages=messages)
    return gen_openai_model.call_openai_model(model=model, messages=messages)
