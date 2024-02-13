import { SafeAreaView, StyleSheet, Text, View, Button } from 'react-native';

import Lang from './Lang';

const Separator = () => <View style={styles.separator} />;

export default function OfflineModeInfo({ navigation }) {
    return (
        <SafeAreaView style={styles.container}>
          <Text style={styles.centeredText}>
            { Lang.t('offlineModeInfoMessage') }
          </Text>

          <Separator />

          <Button
            title={ Lang.t('gotItBtnLabel') }
            color="#be4936"
            onPress={() => { navigation.goBack(); }}
          ></Button>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    color: '#fff',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 0,
    paddingVertical: 6,
    paddingHorizontal: 6
  },
  centeredText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'normal',
    textAlign: 'center'
  },
  separator: {
    marginVertical: 8,
    borderBottomColor: '#737373',
    borderBottomWidth: StyleSheet.hairlineWidth,
  }
});