import mongoose from "mongoose";
import * as Model from "../model"
let logger = require("../utils/logger");

import * as Utils from "../utils"

const modelExists =()=>{
  console.log('modelExists init');

  Model.Dblog.find({}, async(err, result)=> {
    if (err) {
      console.error('Error finding Dblog:', err);
      return;
    }

    if (result.length > 0) {
      console.log('Dblog already exist in the database.');
    } else {
      let newDblog = new Model.Dblog({});
      await newDblog.save();
      await Model.Dblog.deleteMany({})

      console.log('Dblog added to the database');
    }
  });

  Model.Song.find({}, async (err, result) => {
    if (err) {
      console.error('Error finding songs:', err);
      return;
    }

    if (result.length > 0) {
      console.log('Songs already exist in the database.');
    } else {
      try {
        let newSong = new Model.Song({});
        await newSong.save();
        console.log('Song added to the database.');
        await Model.Song.deleteMany({});

        const thaiPlaylists = [
          { id: '1', title: 'แสงสุดท้าย', artist: 'Bodyslam' },
          { id: '2', title: 'รักคุณเข้าแล้ว', artist: 'แบงค์' },
          { id: '3', title: 'คนไม่จำเป็น', artist: 'Getsunova' },
          { id: '4', title: 'คืนข้ามปี', artist: 'แดน วรเวช' },
          { id: '5', title: 'ปล่อย', artist: 'ป๊อบ ปองกูล' },
        ];
        try {
          const songs = await Model.Song.insertMany(thaiPlaylists);
          console.log('Thai songs added to the database:', songs);
        } catch (error) {
          console.error('Error adding Thai songs to the database:', error);
        }
      } catch (error) {
        console.error('Error saving Song:', error);
      }
    }
  });

  Model.Playlist.find({}, async (err, result) => {
    if (err) {
      console.error('Error finding playlist:', err);
      return;
    }

    if (result.length > 0) {
      console.log('Playlist already exists in the database.');
    } else {
      try {
        let newPlaylist = new Model.Playlist({});
        await newPlaylist.save();
        console.log('Playlist added to the database.');
        await Model.Playlist.deleteMany({});

        const thaiPlaylists = [{ name: 'PlayList @1', songs: [] } ];
        try {
          const playlist = await Model.Playlist.insertMany(thaiPlaylists);
          console.log('Playlist added to the database:', playlist);
        } catch (error) {
          console.error('Playlist added to the database error :', error);
        }
      } catch (error) {
        console.error('Error saving Playlist:', error);
      }
    }
  });
}

// TODO: initial and connect to MongoDB
mongoose.Promise = global.Promise;
// mongoose.connect("YOUR_MONGODB_URI", { useNewUrlParser: true });
// console.log(">>>>> process.env :", process.env)
// uri
mongoose.connect(
  // "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/bl?replicaSet=rs",
  process.env.MONGO_URI,
  {
    useNewUrlParser: true,
    useFindAndModify: false, // optional
    useCreateIndex: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 100000, // Defaults to 30000 (30 seconds)
    poolSize: 100, // Set the maximum number of connections in the connection pool
  }
);

const connection = mongoose.connection;
connection.on("error", (err)=>{
  logger.error("Error : Connection to database :", err.toString() )
});
connection.once("open", async function () {
  logger.info("Successfully : Connected to database!")
  modelExists()
});

export default connection;