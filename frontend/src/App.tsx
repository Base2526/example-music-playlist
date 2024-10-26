import React, { useState } from 'react';
import { useQuery, gql, useMutation } from '@apollo/client';
import { Layout, Menu, Input, Button, List, Select, message } from 'antd';
// import { Playlist, Song } from './types'; // Define these types in a separate file if needed

interface Song {
  _id: string;
  title: string;
  artist: string;
}

interface Playlist {
  _id: string;
  name: string;
  songs: Song[];
}

const { Header, Sider, Content } = Layout;
const { Option } = Select;

// GraphQL queries and mutations
const query_songs = gql`query songs { songs }`;
const query_playlists = gql`query playlists { playlists }`;
const mutation_create_playlist = gql`mutation createPlaylist($input: JSON) { createPlaylist(input: $input) }`;
const mutation_add_song2playlist = gql`mutation addSongToPlaylist($input: JSON) { addSongToPlaylist(input: $input) }`;
const mutation_remove_song_from_playlist = gql`mutation removeSongFromPlaylist($input: JSON) { removeSongFromPlaylist(input: $input) }`;

const App: React.FC = () => {
  const [playlistName, setPlaylistName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlaylists, setSelectedPlaylists] = useState<{ [songId: string]: string }>({});

  // Apollo queries and mutations
  const { loading: loadingSongs, data: dataSongs, refetch: refetchSongs } = useQuery(query_songs, { fetchPolicy: 'no-cache' });
  const { loading: loadingPlaylists, data: dataPlaylists, refetch: refetchPlaylists } = useQuery(query_playlists, { fetchPolicy: 'no-cache' });
  const [createPlaylist] = useMutation(mutation_create_playlist, {
    update: (cache, { data: { order } }) => {
      refetchSongs()
      refetchPlaylists()
    },
    onError: (error) => {
    }
  });
  const [addSong2Playlist] = useMutation(mutation_add_song2playlist, {
    update: (cache, { data: { addSongToPlaylist } }) => {

      console.log("addSong2Playlist :", addSongToPlaylist)
      let { status } = addSongToPlaylist
      if(!status){
        message.error(addSongToPlaylist?.message)
        return;
      }
      refetchSongs()
      refetchPlaylists()
    },
    onError: (error) => {
      console.error("addSong2Playlist :", error)
    }
  });
  const [removeSongFromPlaylist] = useMutation(mutation_remove_song_from_playlist, {
    update: (cache, { data: { order } }) => {
      refetchSongs()
      refetchPlaylists()
    },
    onError: (error) => {
    }
  });

  if (loadingSongs || loadingPlaylists) return <p>Loading...</p>;

  console.log("dataPlaylists :", dataPlaylists)

  const filteredSongs = dataSongs?.songs?.data.filter((song: Song) => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return song.title.toLowerCase().includes(lowerCaseSearchTerm) || song.artist.toLowerCase().includes(lowerCaseSearchTerm);
  });

  const handleCreatePlaylist = async () => {
    await createPlaylist({ variables: { input: { name: playlistName } } });
    setPlaylistName('');
  };

  const handleAddSong2Playlist = async (songId: string) => {
    const playlistId = selectedPlaylists[songId];
    if (playlistId) {
      await addSong2Playlist({ variables: { input: { playlistId, songId } } });
    }
  };

  const handleRemoveSongFromPlaylist = async (playlistId: string, songId: string) => {
    await removeSongFromPlaylist({ variables: { input: { playlistId, songId } } });
  };

  const handlePlaylistSelectChange = (songId: string, playlistId: string) => {
    setSelectedPlaylists((prevState) => ({
      ...prevState,
      [songId]: playlistId,
    }));
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', textAlign: 'center', fontSize: '24px' }}>Music Management</Header>
      <Layout style={{ padding: '24px' }}>
        <Content style={{ padding: '24px', background: '#fff' }}>
          <Input.Search
            placeholder="Search for a song..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ marginBottom: '16px' }}
          />

          <h3>Song List</h3>
          <List
            dataSource={filteredSongs}
            renderItem={(song: any) => (
              <List.Item>
                <div>
                  {song.title} by {song.artist}
                  <Select
                    placeholder="Select Playlist"
                    onChange={(value) => handlePlaylistSelectChange(song._id, value)}
                    value={selectedPlaylists[song._id] || ''}
                    style={{ width: 200, marginLeft: 8 }}
                  >
                    {dataPlaylists?.playlists?.data.map((playlist: Playlist) => (
                      <Option key={playlist._id} value={playlist._id}>
                        {playlist.name}
                      </Option>
                    ))}
                  </Select>
                  <Button
                    type="primary"
                    onClick={() => handleAddSong2Playlist(song._id)}
                    disabled={!selectedPlaylists[song._id]}
                    style={{ marginLeft: 8 }}
                  >
                    Add to Playlist
                  </Button>
                </div>
              </List.Item>
            )}
          />

          <h3>Playlists</h3>
          <Input
            placeholder="Enter playlist name"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Button type="primary" onClick={handleCreatePlaylist} style={{ marginBottom: 16 }}>
            Create Playlist
          </Button>

          <List
            dataSource={dataPlaylists?.playlists?.data}
            renderItem={(playlist: Playlist) => (
              <List.Item key={playlist._id}>
                <div>
                  {playlist.name}
                  <ul>
                    {playlist.songs.map((song: Song) => (
                      <li key={song._id}>
                        {song.title} - {song.artist}
                        <Button
                          type="link"
                          onClick={() => handleRemoveSongFromPlaylist(playlist._id, song._id)}
                          style={{ marginLeft: 8 }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </List.Item>
            )}
          />
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
