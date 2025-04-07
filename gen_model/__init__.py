"""
Gen Model
"""
from gen_model.gen_openai import gen_openai

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
    if model in ["gpt-4o", "gpt-4o-32k", "gpt-4o-mini"]:
        return gen_openai.call_openai_model(model=model, messages=messages)
    return gen_openai.call_openai_model(model=model, messages=messages)
