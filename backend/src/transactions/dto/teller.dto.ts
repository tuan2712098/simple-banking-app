import { IsUUID } from 'class-validator';
import { TransferDto } from './transfer.dto';

export class TellerTransferDto extends TransferDto {
  @IsUUID()
  ownerId: string;
}
