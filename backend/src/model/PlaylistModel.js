import mongoose from 'mongoose';

const Schema = mongoose.Schema
const playlistSchema = new Schema({
  name: String,
  songs: [{ type: Schema.Types.ObjectId }],
},
{
    timestamps: true
});

const Playlist = mongoose.model('playlist', playlistSchema,'playlist')
export default Playlist