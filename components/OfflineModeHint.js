
import { Pressable, View } from 'react-native';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function OfflineModeHint({ navigation, isOffline }) {
    if (!isOffline) { return <View />; }

    return (
        <Pressable style={{
            position: 'absolute',
            bottom:   0,
            zIndex:   3
        }} onPress={() => { navigation.navigate('OfflineModeInfo'); }}>
            <View style={{
                display:           'flex',
                flexDirection:     'row',
                opacity:           .5,
                padding:           5,
                borderWidth:       1,
                borderColor:       'black',
                borderStyle:       'solid',
                borderRadius:      50,
                backgroundColor:   '#545454'
            }}>
                <Icon name="cloud-off-outline" size={18} color="white" />
            </View>
        </Pressable>
    );
}