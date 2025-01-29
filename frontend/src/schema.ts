export class OrganizationSchema {
    id: string = '';
    name: string = '';
    description: string = '';
    createdAt: string = '';
    updatedAt: string = '';
}

export class UserSchema {
    id: string = '';
    email: string = '';
    firstName: string = '';
    lastName: string = '';
    photoURL: string = '';
    permission: string = '';
    organization: string = '';
    organizationPermission: string = '';
    createdAt: string = '';
    updatedAt: string = '';
}

export class LargeModelSchema {
    id: string = '';
    name: string = '';
    description: string = '';
    rank: number = 0;
    provider: string = '';
    organization: string = '';
    active: boolean = false;
    createdAt: string = '';
    updatedAt: string = '';
}

export class ConnectorSchema {
    id: string = '';
    name: string = '';
    description: string = '';
    function: string = '';
    organization: string = '';
    active: boolean = false;
    createdAt: string = '';
    updatedAt: string = '';
}

export class PromptTemplateSchema {
    id: string = '';
    title: string = '';
    description: string = '';
    instructions: string = '';
    organization: string = '';
    template: string = '';
    placeholder: string = '';
    model: string = '';
    connector: string = '';
    active: boolean = false;
    createdAt: string = '';
    updatedAt: string = '';
}

export class ChatSchema {
    id: string = '';
    user: UserSchema = new UserSchema();
    model: LargeModelSchema = new LargeModelSchema();
    template: PromptTemplateSchema = new PromptTemplateSchema();
    history: MessageSchema[] = [];
    organization: string = '';
    createdAt: string = '';
    updatedAt: string = '';
}

export class MessageSchema {
    id?: string = '';
    role: string = '';
    content: string = '';
    createdAt: string = '';
    updatedAt: string = '';
}

export class CompletionsInputSchema {
    query: string = '';
    prompt?: string = '';
    history?: MessageSchema[] = [];
}
