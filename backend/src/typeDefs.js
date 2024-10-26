const gql = require('graphql-tag');
export default gql`
  scalar DATETIME
  scalar Long
  scalar Date
  scalar JSON
  scalar Upload

  type Query {
    songs: JSON 
    playlists: JSON
  }  

  type Mutation {
    createPlaylist(input: JSON): JSON
    addSongToPlaylist(input: JSON): JSON
    removeSongFromPlaylist(input: JSON): JSON
  }
`;
