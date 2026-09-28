import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('account_history')
export class AccountHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'previous_email', type: 'varchar', length: 255 })
  previousEmail: string;

  @Column({ name: 'updated_email', type: 'varchar', length: 255 })
  updatedEmail: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
