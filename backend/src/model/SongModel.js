import mongoose from 'mongoose';
const Schema = mongoose.Schema

const songSchema = new Schema({
  title: String,
  artist: String,
},
{
    timestamps: true
});

const Song = mongoose.model('song', songSchema,'song')
export default Song
