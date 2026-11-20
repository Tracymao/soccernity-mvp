import { IsIn } from 'class-validator';

export const DELETE_MESSAGE_SCOPES = ['me', 'everyone'] as const;
export type DeleteMessageScope = (typeof DELETE_MESSAGE_SCOPES)[number];

// DELETE /conversations/:id/messages/:messageId?scope=me|everyone (B-067). Required: there is no default scope,
// because "for me" and "for everyone" must never be chosen by accident.
export class DeleteMessageQueryDto {
  @IsIn(DELETE_MESSAGE_SCOPES)
  scope!: DeleteMessageScope;
}
