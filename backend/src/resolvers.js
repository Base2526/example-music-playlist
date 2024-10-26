import _ from "lodash";
import deepdash from "deepdash";
deepdash(_);
import { GraphQLUpload } from 'graphql-upload';
import * as Model from "./model"
const mongoose = require('mongoose');

export default {
  Query: {
    async songs(parent, args, context, info){
      let start = Date.now()
      let songs =  await Model.Song.find();
      return {
        status: true,
        data: songs,
        executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
      }
    },
    async playlists(parent, args, context, info){
      let start = Date.now()
      const playlists = await Model.Playlist.aggregate([
        {
          $lookup: {
            from: 'song', // The name of the songs collection
            localField: 'songs',
            foreignField: '_id',
            as: 'songDetails',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            createdAt: 1,
            updatedAt: 1,
            songs: '$songDetails', // Renaming the songs array for clarity
          },
        },
      ]);
      console.log("playlists @@1 ", playlists)
      return {
        status: true,
        data: playlists,
        executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
      }
    },
  },
  Upload: GraphQLUpload,
  Mutation: {
    async createPlaylist(parent, args, context, info){
      let start = Date.now()
      let { input } = args

      const playlist = new Model.Playlist({ name: input.name, songs: [] });
      await playlist.save();

      return {  
        status: true, 
        data: playlist,
        executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
      }
    },
    async addSongToPlaylist(parent, args, context, info){
      let start = Date.now()
      let { input } = args

      console.log("addSongToPlaylist @1 :", input)

      const playlist = await Model.Playlist.findById(mongoose.Types.ObjectId(input.playlistId));
      const song = await Model.Song.findById(mongoose.Types.ObjectId(input.songId));

      // Check if the song already exists in the playlist
      const songExists = playlist.songs.some(songId => songId.equals(mongoose.Types.ObjectId(input.songId)));
      if (songExists) {
        return {
          status: false,
          message: "Song already exists in the playlist",
          executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
        };
      }

      playlist.songs.push(song);
      await playlist.save();

      console.log("addSongToPlaylist @2 :", playlist)
      return {  
        status: true, 
        data: playlist,
        executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
      }
    },
    async removeSongFromPlaylist(parent, args, context, info){
      let start = Date.now()
      let { input } = args
      const playlist = await Model.Playlist.findById(mongoose.Types.ObjectId(input.playlistId));
      playlist.songs.pull(mongoose.Types.ObjectId(input.songId));
      await playlist.save();

      return {  
        status: true, 
        data: playlist,
        executionTime: `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
      }
    },
  },
}