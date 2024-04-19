import mongoose, { Schema, model, ObjectId } from "mongoose";
import { User } from "telegraf/typings/core/types/typegram";
import { vote } from "./ISentence";

interface IUser extends User {
    _id?: ObjectId;
    createdAt?: any;
    sponsor: number;
    wallet: string;
}

const userSchema: Schema<IUser> = new Schema<IUser>({
    id: { type: Number, required: true },
    username: { type: String, required: false },
    first_name: { type: String, required: false },
    last_name: { type: String, required: false },
    sponsor: { type: Number, required: false },
    wallet: { type: String, required: false },
}, {
    timestamps: true
});

const User = model<IUser>('User', userSchema);
export { User, IUser }
